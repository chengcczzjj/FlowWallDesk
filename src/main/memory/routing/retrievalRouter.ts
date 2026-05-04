/**
 * 智能检索路由（Retrieval Router）
 *
 * 职责:
 * - 根据场景和用户输入，决定"查哪里、怎么查、哪些不能查"
 * - 规划检索策略（精确查询 / 关键词 / 语义 / 混合）
 * - 过滤不允许的数据层
 * - 控制上下文长度
 *
 * 设计原则（参考 memory-system-design.md §5）:
 * - 不同信息类型用不同方式检索
 * - 不每句话全库搜索
 * - 先判断场景 → 再选数据层 → 再选检索方式
 *
 * 当前实现: 规则引擎版，不调用 LLM。
 * 未来: 可升级为 LLM-based router agent。
 */
import type { SceneDecision } from './sceneRouter'
import { StateStore } from '../state/stateStore'
import { MemoryStore, type MemoryRecord, type MemoryQueryOptions } from '../memories/memoryStore'

/** 检索计划 */
export interface RetrievalPlan {
  /** 允许查询的数据源 */
  sources: ('state' | 'memory' | 'events')[]
  /** 记忆检索参数 */
  memoryQuery?: MemoryQueryOptions
  /** 状态检索 domains */
  stateDomains?: string[]
  /** 上下文预算（最大注入 token 估算） */
  maxContextChars: number
  /** 是否需要深度检索（多轮搜索） */
  deep: boolean
}

/** 检索结果 */
export interface RetrievalResult {
  /** 记忆条目 */
  memories: MemoryRecord[]
  /** 状态条目格式化文本 */
  stateText: string | null
  /** 总消耗字符数 */
  totalChars: number
}

/**
 * 分析用户输入，提取可能的检索关键词
 */
function extractKeywords(text: string): string[] {
  // 移除标点和停用词
  const cleaned = text.replace(/[？！。，、：；""''（）\s\n]+/g, ' ').trim()
  const words = cleaned.split(' ').filter((w) => w.length >= 2)

  // 简单停用词过滤
  const stopWords = new Set([
    '什么', '怎么', '如何', '为什么', '是不是', '可以', '能不能',
    '帮我', '告诉', '知道', '觉得', '应该', '可能', '已经',
    '这个', '那个', '一个', '他们', '我们', '自己',
  ])
  return words.filter((w) => !stopWords.has(w)).slice(0, 8)
}

/**
 * 判断是否涉及特定领域（用于精确检索）
 */
function detectDomains(text: string): string[] {
  const domains: string[] = []
  if (/天气|气温|温度|下雨|下雪/.test(text)) domains.push('weather')
  if (/任务|待办|TODO|做完|没做/.test(text)) domains.push('task')
  if (/日程|约会|会议|安排/.test(text)) domains.push('schedule')
  if (/项目|开发|代码|bug/.test(text)) domains.push('project')
  if (/设备|手机|电脑|音量/.test(text)) domains.push('device')
  return domains
}

export const RetrievalRouter = {
  /**
   * 根据场景和用户输入规划检索策略
   */
  plan(scene: SceneDecision, userText: string): RetrievalPlan {
    const keywords = extractKeywords(userText)
    const detectedDomains = detectDomains(userText)

    // 根据场景深度决定检索范围
    const deep = scene.depth === 'deep'
    const maxContextChars = deep ? 3000 : 1500

    // 确定允许查询的数据源
    const sources: ('state' | 'memory' | 'events')[] = ['memory']
    if (detectedDomains.length > 0 || scene.scene === 'tool') {
      sources.unshift('state')
    }

    // 构建记忆检索参数
    const memoryQuery: MemoryQueryOptions = {
      scopes: scene.allowed,
      keywords: keywords.length > 0 ? keywords : undefined,
      limit: deep ? 12 : 6,
    }

    // 状态检索 domains
    const domainMap: Record<string, string[]> = {
      daily: ['user', 'preference', 'schedule', ...detectedDomains],
      work: ['task', 'project', 'schedule', ...detectedDomains],
      tool: ['device', 'system', 'task', ...detectedDomains],
      emotion: ['user', 'preference'],
      private: ['preference'],
    }
    const stateDomains = domainMap[scene.scene] ?? detectedDomains

    return {
      sources,
      memoryQuery,
      stateDomains: stateDomains.length > 0 ? stateDomains : undefined,
      maxContextChars,
      deep,
    }
  },

  /**
   * 执行检索计划，返回结果
   */
  execute(plan: RetrievalPlan): RetrievalResult {
    let totalChars = 0
    const result: RetrievalResult = {
      memories: [],
      stateText: null,
      totalChars: 0,
    }

    // 1. 状态检索
    if (plan.sources.includes('state') && plan.stateDomains) {
      const stateEntries: string[] = []
      for (const domain of plan.stateDomains) {
        const states = StateStore.getByDomain(domain)
        for (const s of states.slice(0, 3)) {
          const val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value)
          const entry = `[${s.key}] ${val}`
          if (totalChars + entry.length < plan.maxContextChars) {
            stateEntries.push(entry)
            totalChars += entry.length
          }
        }
      }
      if (stateEntries.length > 0) {
        result.stateText = stateEntries.join('\n')
      }
    }

    // 2. 记忆检索
    if (plan.sources.includes('memory') && plan.memoryQuery) {
      const memories = MemoryStore.query(plan.memoryQuery)
      for (const m of memories) {
        const entry = `[${m.key}] ${m.content}`
        if (totalChars + entry.length < plan.maxContextChars) {
          result.memories.push(m)
          totalChars += entry.length
          // 标记记忆被访问
          MemoryStore.touch(m.id)
        } else {
          break
        }
      }
    }

    result.totalChars = totalChars
    return result
  },

  /**
   * 一步到位：规划 + 执行
   */
  retrieve(scene: SceneDecision, userText: string): RetrievalResult {
    const plan = this.plan(scene, userText)
    return this.execute(plan)
  },
}
