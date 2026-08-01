/**
 * 记忆总结 Worker（Memory Consolidation Service）
 *
 * 功能：
 * - 定时从 events 中提取"未来有用的信息"，写入 memories 表
 * - 不记录普通闲聊、临时操作和大量中间过程
 * - 提取：用户偏好、重要决策、情绪事件、关系信息、工作目标
 *
 * 策略（参考设计文档）：
 * - 每天定时触发 2 次
 * - 用户说"记住这个"时立即写入
 * - 工作会话结束后标记为待总结
 *
 * 实现方式：
 * - 使用 LLM 从对话事件中提取候选记忆
 * - 使用 mem0 风格的 ADD / UPDATE / MERGE / NOOP 操作
 * - 提取后将 events 的 summaryStatus 标记为 'summarized'
 */
import { getDb } from '../db/client'
import { events, summaryJobs } from '../db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { ulid } from 'ulidx'
import { ModelConfig } from '../models/config'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createModel } from '../models/chatModel'
import { MemoryStore } from '../memories/memoryStore'
import type { StoredEvent } from '../events/types'

/** 总结任务状态 */
let consolidationTimer: ReturnType<typeof setInterval> | null = null
let initialConsolidationTimer: ReturnType<typeof setTimeout> | null = null
let consolidationInFlight: Promise<{ processed: number; memoriesAdded: number }> | null = null

const ExtractedMemorySchema = z.object({
  key: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
  importance: z.enum(['high', 'medium', 'low']),
  scope: z.enum(['user', 'companion', 'work', 'general']),
})

/** 提取记忆的 prompt 模板 */
const EXTRACTION_PROMPT = `你是一个记忆提取助手。从以下对话记录中提取"未来对用户可能有用的信息"。

提取规则：
1. 只提取稳定、长期有效的信息，不记录临时操作和普通闲聊
2. 重点提取：用户偏好、习惯、重要关系、纪念日、情绪事件、工作目标、关键决策
3. 每条记忆用简短的 key 标签 + 一句话内容描述
4. 对每条记忆标注重要度：high（重要偏好/关系/目标）、medium（普通偏好/习惯）、low（次要信息）
5. 标注 scope：user（用户个人信息）、companion（互动偏好）、work（工作相关）、general（通用）
6. 如果对话中没有值得长期记住的内容，返回空数组

输出格式（JSON 数组）：
[
  { "key": "标签", "content": "内容描述", "importance": "high|medium|low", "scope": "user|companion|work|general" }
]

只输出 JSON 数组，不要其他内容。如果没有可提取的记忆，输出 []。`

/**
 * 从一批事件中提取记忆
 */
async function extractMemories(eventBatch: StoredEvent[]): Promise<
  { ok: boolean; memories: z.infer<typeof ExtractedMemorySchema>[]; error?: string }
> {
  const profile = ModelConfig.getActive()
  if (!profile) return { ok: false, memories: [], error: 'model-profile-missing' }

  // 构建对话文本
  const dialogText = eventBatch
    .map((ev) => {
      const content = ev.content as { text?: string; toolName?: string }
      if (ev.eventType === 'user_message') return `用户: ${content.text}`
      if (ev.eventType === 'assistant_message') return `AI: ${content.text}`
      if (ev.eventType === 'tool_call') return `[工具调用: ${content.toolName}]`
      return null
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 60_000)

  if (!dialogText.trim()) return { ok: true, memories: [] }

  try {
    const model = createModel(profile)

    const result = await generateText({
      model,
      system: EXTRACTION_PROMPT,
      messages: [
        { role: 'user', content: dialogText },
      ],
      temperature: 0.3,
      maxOutputTokens: 1000,
      output: Output.array({
        element: ExtractedMemorySchema,
        name: 'long_term_memories',
        description: '值得长期保留的用户记忆；没有时返回空数组。',
      }),
    })

    return { ok: true, memories: result.output }
  } catch (error) {
    return { ok: false, memories: [], error: (error as Error).message }
  }
}

/**
 * 执行一次记忆总结任务
 *
 * 流程：
 * 1. 查找所有 summaryStatus='pending' 的事件
 * 2. 按会话分组
 * 3. 对每组用 LLM 提取候选记忆
 * 4. 用 MemoryStore.upsert 写入（自动去重/合并）
 * 5. 标记事件为 'summarized'
 * 6. 记录 summaryJob
 */
async function runConsolidationOnce(): Promise<{ processed: number; memoriesAdded: number }> {
  const db = getDb()
  let processed = 0
  let memoriesAdded = 0
  let failedBatches = 0

  // 创建 job 记录
  const jobId = ulid()
  const jobMode = 'daily'
  db.insert(summaryJobs)
    .values({
      id: jobId,
      status: 'running',
      mode: jobMode,
      startedAt: Date.now(),
      createdAt: Date.now(),
    })
    .run()

  try {
    // 1. 获取待总结的事件（按时间排序，限制批次大小）
    const pendingEvents = db
      .select()
      .from(events)
      .where(eq(events.summaryStatus, 'pending'))
      .orderBy(asc(events.createdAt))
      .limit(200)
      .all()

    if (pendingEvents.length === 0) {
      db.update(summaryJobs)
        .set({ status: 'completed', completedAt: Date.now(), resultSummary: 'No pending events' })
        .where(eq(summaryJobs.id, jobId))
        .run()
      return { processed: 0, memoriesAdded: 0 }
    }

    // Private events never enter the general memory database.
    const privateEvents = pendingEvents.filter((event) => event.sensitivity === 'private')
    for (const event of privateEvents) {
      db.update(events).set({ summaryStatus: 'ignored' }).where(eq(events.id, event.id)).run()
      processed += 1
    }

    // 2. 按会话分组
    const byConversation = new Map<string, typeof pendingEvents>()
    for (const ev of pendingEvents.filter((event) => event.sensitivity !== 'private')) {
      const convId = ev.conversationId
      if (!byConversation.has(convId)) {
        byConversation.set(convId, [])
      }
      byConversation.get(convId)!.push(ev)
    }

    // 3. 对每个会话批次提取记忆
    for (const [, convEvents] of byConversation) {
      // 转换为 StoredEvent 格式
      const storedEvents: StoredEvent[] = convEvents.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        projectId: e.projectId,
        eventType: e.eventType as StoredEvent['eventType'],
        mode: e.mode as StoredEvent['mode'],
        content: JSON.parse(e.contentJson),
        sensitivity: e.sensitivity as StoredEvent['sensitivity'],
        createdAt: e.createdAt,
        summaryStatus: e.summaryStatus as StoredEvent['summaryStatus'],
      }))

      const extraction = await extractMemories(storedEvents)
      if (!extraction.ok) {
        failedBatches += 1
        continue
      }

      // 4. 写入记忆
      for (const mem of extraction.memories) {
        const op = MemoryStore.upsert({
          key: mem.key,
          scope: mem.scope,
          content: mem.content,
          importance: mem.importance,
          projectId: convEvents[0]?.projectId ?? undefined,
          sensitivity: convEvents.some((event) => event.sensitivity === 'sensitive') ? 'sensitive' : 'normal',
          sourceEventId: convEvents[0]?.id,
        })
        if (op === 'add' || op === 'update') {
          memoriesAdded++
        }
      }

      // 5. 标记已总结
      for (const ev of convEvents) {
        db.update(events)
          .set({ summaryStatus: 'summarized' })
          .where(eq(events.id, ev.id))
          .run()
      }

      processed += convEvents.length
    }

    // 6. 完成 job
    db.update(summaryJobs)
      .set({
        status: 'completed',
        completedAt: Date.now(),
        resultSummary: `Processed ${processed} events, extracted ${memoriesAdded} memories, retry batches ${failedBatches}`,
      })
      .where(eq(summaryJobs.id, jobId))
      .run()
  } catch (e) {
    db.update(summaryJobs)
      .set({
        status: 'failed',
        completedAt: Date.now(),
        resultSummary: `Error: ${(e as Error).message}`,
      })
      .where(eq(summaryJobs.id, jobId))
      .run()
  }

  return { processed, memoriesAdded }
}

export function runConsolidation(): Promise<{ processed: number; memoriesAdded: number }> {
  if (consolidationInFlight) return consolidationInFlight
  consolidationInFlight = runConsolidationOnce().finally(() => {
    consolidationInFlight = null
  })
  return consolidationInFlight
}

/**
 * 启动定时总结（每 12 小时执行一次）
 */
export function startConsolidationSchedule(): void {
  if (consolidationTimer) return

  // 延迟 5 分钟后首次执行（避免启动时阻塞）
  initialConsolidationTimer = setTimeout(() => {
    initialConsolidationTimer = null
    runConsolidation().catch(() => {})
  }, 5 * 60_000)

  // 每 12 小时执行一次
  consolidationTimer = setInterval(
    () => {
      runConsolidation().catch(() => {})
    },
    12 * 60 * 60_000
  )
}

/**
 * 停止定时总结
 */
export function stopConsolidationSchedule(): void {
  if (initialConsolidationTimer) {
    clearTimeout(initialConsolidationTimer)
    initialConsolidationTimer = null
  }
  if (consolidationTimer) {
    clearInterval(consolidationTimer)
    consolidationTimer = null
  }
}

/**
 * 立即触发一次记忆提取（用于用户说"记住这个"）
 */
export async function immediateExtract(conversationId: string): Promise<number> {
  const db = getDb()

  // 获取该会话最近的事件
  const recentEvents = db
    .select()
    .from(events)
    .where(
      and(
        eq(events.conversationId, conversationId),
        eq(events.summaryStatus, 'pending')
      )
    )
    .orderBy(asc(events.createdAt))
    .limit(50)
    .all()

  if (recentEvents.length === 0) return 0

  const eligibleEvents = recentEvents.filter((event) => event.sensitivity !== 'private')
  for (const event of recentEvents.filter((item) => item.sensitivity === 'private')) {
    db.update(events).set({ summaryStatus: 'ignored' }).where(eq(events.id, event.id)).run()
  }
  if (eligibleEvents.length === 0) return 0

  const storedEvents: StoredEvent[] = eligibleEvents.map((e) => ({
    id: e.id,
    conversationId: e.conversationId,
    projectId: e.projectId,
    eventType: e.eventType as StoredEvent['eventType'],
    mode: e.mode as StoredEvent['mode'],
    content: JSON.parse(e.contentJson),
    sensitivity: e.sensitivity as StoredEvent['sensitivity'],
    createdAt: e.createdAt,
    summaryStatus: e.summaryStatus as StoredEvent['summaryStatus'],
  }))

  const extraction = await extractMemories(storedEvents)
  if (!extraction.ok) return 0
  let added = 0

  for (const mem of extraction.memories) {
    const op = MemoryStore.upsert({
      key: mem.key,
      scope: mem.scope,
      content: mem.content,
      importance: mem.importance,
      projectId: eligibleEvents[0]?.projectId ?? undefined,
      sensitivity: eligibleEvents.some((event) => event.sensitivity === 'sensitive') ? 'sensitive' : 'normal',
      sourceEventId: eligibleEvents[0]?.id,
    })
    if (op === 'add' || op === 'update') added++
  }

  // 标记已总结
  for (const ev of eligibleEvents) {
    db.update(events)
      .set({ summaryStatus: 'summarized' })
      .where(eq(events.id, ev.id))
      .run()
  }

  return added
}
