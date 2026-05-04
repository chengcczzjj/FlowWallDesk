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
import { generateText } from 'ai'
import { createModel } from '../models/chatModel'
import { MemoryStore } from '../memories/memoryStore'
import type { StoredEvent } from '../events/types'

/** 总结任务状态 */
let consolidationTimer: ReturnType<typeof setInterval> | null = null

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
  { key: string; content: string; importance: 'high' | 'medium' | 'low'; scope: string }[]
> {
  const profile = ModelConfig.getActive()
  if (!profile) return []

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

  if (!dialogText.trim()) return []

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
    })

    // 解析 JSON 响应
    const text = result.text.trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (m: unknown) =>
        m &&
        typeof m === 'object' &&
        'key' in m &&
        'content' in m &&
        typeof (m as { key: unknown }).key === 'string' &&
        typeof (m as { content: unknown }).content === 'string'
    )
  } catch {
    return []
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
export async function runConsolidation(): Promise<{ processed: number; memoriesAdded: number }> {
  const db = getDb()
  let processed = 0
  let memoriesAdded = 0

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

    // 2. 按会话分组
    const byConversation = new Map<string, typeof pendingEvents>()
    for (const ev of pendingEvents) {
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

      const extracted = await extractMemories(storedEvents)

      // 4. 写入记忆
      for (const mem of extracted) {
        const op = MemoryStore.upsert({
          key: mem.key,
          scope: mem.scope,
          content: mem.content,
          importance: mem.importance,
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
        resultSummary: `Processed ${processed} events, extracted ${memoriesAdded} memories`,
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

/**
 * 启动定时总结（每 12 小时执行一次）
 */
export function startConsolidationSchedule(): void {
  if (consolidationTimer) return

  // 延迟 5 分钟后首次执行（避免启动时阻塞）
  setTimeout(() => {
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

  const storedEvents: StoredEvent[] = recentEvents.map((e) => ({
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

  const extracted = await extractMemories(storedEvents)
  let added = 0

  for (const mem of extracted) {
    const op = MemoryStore.upsert({
      key: mem.key,
      scope: mem.scope,
      content: mem.content,
      importance: mem.importance,
      sourceEventId: recentEvents[0]?.id,
    })
    if (op === 'add' || op === 'update') added++
  }

  // 标记已总结
  for (const ev of recentEvents) {
    db.update(events)
      .set({ summaryStatus: 'summarized' })
      .where(eq(events.id, ev.id))
      .run()
  }

  return added
}
