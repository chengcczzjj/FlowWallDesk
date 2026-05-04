/**
 * Phase 4: 长期记忆存储
 *
 * 设计参考:
 * - mem0 的 ADD / UPDATE / MERGE / NOOP 操作语义
 * - 本地优先，SQLite 全文匹配 + 关键词检索
 * - Phase 5 将升级为向量检索（sqlite-vec）
 *
 * 核心能力:
 * - upsert: 智能写入（按 key 查重，存在则 merge/update）
 * - query: 多维检索（scope, keywords, importance, recency）
 * - decay: 记忆衰减（长期未访问降低 confidence）
 * - archive: 归档不再需要的记忆
 */
import { getDb } from '../db/client'
import { memories } from '../db/schema'
import { eq, desc, and, gte } from 'drizzle-orm'
import { ulid } from 'ulidx'

export type MemoryImportance = 'low' | 'medium' | 'high'
export type MemoryStatus = 'active' | 'archived' | 'deleted'

export interface MemoryRecord {
  id: string
  key: string
  scope: string
  memoryType: string | null
  projectId: string | null
  content: string
  importance: MemoryImportance
  confidence: number
  sensitivity: string
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  status: string
  sourceEventIds: string | null
}

export interface MemoryQueryOptions {
  scopes?: string[]
  keywords?: string[]
  importance?: MemoryImportance
  limit?: number
  includeArchived?: boolean
}

export interface MemoryUpsertParams {
  key: string
  scope: string
  content: string
  importance?: MemoryImportance
  memoryType?: string
  projectId?: string
  sourceEventId?: string
  sensitivity?: string
}

export const MemoryStore = {
  /**
   * 智能写入记忆
   *
   * 操作语义（参考 mem0）:
   * - 如果同 key 不存在 → ADD
   * - 如果同 key 存在且内容不同 → UPDATE（覆盖内容，提升 confidence）
   * - 如果同 key 存在且内容相同 → NOOP（仅更新时间戳）
   *
   * 返回操作类型
   */
  upsert(params: MemoryUpsertParams): 'add' | 'update' | 'noop' {
    const db = getDb()
    const now = Date.now()

    // 查找是否存在同 key 的记忆
    const existing = db
      .select()
      .from(memories)
      .where(and(eq(memories.key, params.key), eq(memories.status, 'active')))
      .get()

    if (!existing) {
      // ADD: 新增记忆
      db.insert(memories)
        .values({
          id: ulid(),
          key: params.key,
          scope: params.scope,
          memoryType: params.memoryType ?? null,
          projectId: params.projectId ?? null,
          content: params.content,
          importance: params.importance ?? 'medium',
          confidence: 7,
          sensitivity: params.sensitivity ?? 'normal',
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null,
          status: 'active',
          sourceEventIds: params.sourceEventId ?? null,
          embeddingId: null,
        })
        .run()
      return 'add'
    }

    // 检查内容是否变化
    if (existing.content.trim() === params.content.trim()) {
      // NOOP: 内容相同，仅 touch 时间
      db.update(memories)
        .set({ updatedAt: now, lastUsedAt: now })
        .where(eq(memories.id, existing.id))
        .run()
      return 'noop'
    }

    // UPDATE: 内容变化，覆盖并提升 confidence
    const newConfidence = Math.min(10, (existing.confidence ?? 5) + 1)
    db.update(memories)
      .set({
        content: params.content,
        importance: params.importance ?? (existing.importance as MemoryImportance),
        confidence: newConfidence,
        updatedAt: now,
        lastUsedAt: now,
        sourceEventIds: params.sourceEventId
          ? existing.sourceEventIds
            ? `${existing.sourceEventIds},${params.sourceEventId}`
            : params.sourceEventId
          : existing.sourceEventIds,
      })
      .where(eq(memories.id, existing.id))
      .run()
    return 'update'
  },

  /**
   * 多维检索记忆
   *
   * 策略:
   * 1. 按 scope 过滤
   * 2. 按 keywords 模糊匹配 key + content
   * 3. 按 importance 过滤
   * 4. 按 updatedAt 降序排列
   * 5. 限制返回数量
   */
  query(options: MemoryQueryOptions = {}): MemoryRecord[] {
    const db = getDb()
    const { scopes, keywords, importance, limit = 20, includeArchived = false } = options

    // 基础查询
    let rows = db
      .select()
      .from(memories)
      .where(includeArchived ? undefined : eq(memories.status, 'active'))
      .orderBy(desc(memories.updatedAt))
      .limit(limit * 3) // 取多一些，后续 filter
      .all()

    // scope 过滤
    if (scopes && scopes.length > 0) {
      rows = rows.filter((r) => scopes.includes(r.scope) || r.scope === 'general' || r.scope === 'user')
    }

    // importance 过滤
    if (importance) {
      const importanceOrder = { high: 3, medium: 2, low: 1 }
      const minLevel = importanceOrder[importance]
      rows = rows.filter((r) => importanceOrder[r.importance as MemoryImportance] >= minLevel)
    }

    // 关键词匹配
    if (keywords && keywords.length > 0) {
      const matched = rows.filter((r) =>
        keywords.some(
          (kw) => r.content.includes(kw) || r.key.includes(kw)
        )
      )
      // 没有匹配的关键词时，返回高重要度记忆
      if (matched.length === 0) {
        rows = rows.filter((r) => r.importance === 'high')
      } else {
        rows = matched
      }
    }

    return rows.slice(0, limit) as MemoryRecord[]
  },

  /** 根据 ID 获取记忆 */
  getById(id: string): MemoryRecord | null {
    const db = getDb()
    const row = db.select().from(memories).where(eq(memories.id, id)).get()
    return (row as MemoryRecord) ?? null
  },

  /** 标记记忆被访问（更新 lastUsedAt） */
  touch(id: string): void {
    const db = getDb()
    db.update(memories)
      .set({ lastUsedAt: Date.now() })
      .where(eq(memories.id, id))
      .run()
  },

  /** 归档记忆（软删除） */
  archive(id: string): void {
    const db = getDb()
    db.update(memories)
      .set({ status: 'archived', updatedAt: Date.now() })
      .where(eq(memories.id, id))
      .run()
  },

  /** 删除记忆 */
  remove(id: string): void {
    const db = getDb()
    db.update(memories)
      .set({ status: 'deleted', updatedAt: Date.now() })
      .where(eq(memories.id, id))
      .run()
  },

  /**
   * 记忆衰减：对长期未访问的记忆降低 confidence
   * 建议每天执行一次
   */
  decay(daysThreshold = 30): number {
    const db = getDb()
    const threshold = Date.now() - daysThreshold * 86_400_000
    const staleMemories = db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.status, 'active'),
          // confidence > 1 才需要衰减
          gte(memories.confidence, 2)
        )
      )
      .all()

    let decayed = 0
    for (const m of staleMemories) {
      const lastActive = m.lastUsedAt ?? m.updatedAt
      if (lastActive < threshold) {
        const newConf = Math.max(1, (m.confidence ?? 5) - 1)
        db.update(memories)
          .set({ confidence: newConf, updatedAt: Date.now() })
          .where(eq(memories.id, m.id))
          .run()
        decayed++
      }
    }
    return decayed
  },

  /** 获取统计信息 */
  stats(): { total: number; active: number; archived: number; byScope: Record<string, number> } {
    const db = getDb()
    const all = db.select().from(memories).all()
    const active = all.filter((r) => r.status === 'active')
    const archived = all.filter((r) => r.status === 'archived')
    const byScope: Record<string, number> = {}
    for (const r of active) {
      byScope[r.scope] = (byScope[r.scope] ?? 0) + 1
    }
    return { total: all.length, active: active.length, archived: archived.length, byScope }
  },
}
