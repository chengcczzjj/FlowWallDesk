/**
 * Phase 3: 当前状态/事实层
 *
 * 存储结构化的"当前事实"——精确、有效期短、可过期。
 * 例如：当前天气、当前任务、设备状态、用户正在做的事。
 *
 * 设计原则：
 * - key 唯一，重复 upsert 覆盖
 * - expiresAt 到期后 sweepExpired 清理（或读取时跳过）
 * - domain 用于分组查询（如 'weather'、'task'、'device'）
 */
import { getDb } from '../db/client'
import { currentState } from '../db/schema'
import { eq, and, lt, like } from 'drizzle-orm'

export interface StateEntry {
  key: string
  domain: string
  value: unknown
  expiresAt?: number | null
  updatedAt: number
  sourceEventId?: string | null
}

export const StateStore = {
  /**
   * 写入或更新一条状态
   * @param key 唯一键（如 "weather:beijing"、"task:current"）
   * @param domain 分组域（如 "weather"、"task"、"device"）
   * @param value 任意 JSON 值
   * @param options.ttlMs 生存时间（毫秒），到期后 sweep 清理
   * @param options.sourceEventId 来源事件 ID
   */
  upsert(
    key: string,
    domain: string,
    value: unknown,
    options?: { ttlMs?: number; sourceEventId?: string }
  ): void {
    const db = getDb()
    const now = Date.now()
    const expiresAt = options?.ttlMs ? now + options.ttlMs : null

    db.insert(currentState)
      .values({
        key,
        domain,
        valueJson: JSON.stringify(value),
        expiresAt,
        updatedAt: now,
        sourceEventId: options?.sourceEventId ?? null,
      })
      .onConflictDoUpdate({
        target: currentState.key,
        set: {
          domain,
          valueJson: JSON.stringify(value),
          expiresAt,
          updatedAt: now,
          sourceEventId: options?.sourceEventId ?? null,
        },
      })
      .run()
  },

  /** 获取一条状态（忽略已过期的） */
  get(key: string): StateEntry | null {
    const db = getDb()
    const row = db.select().from(currentState).where(eq(currentState.key, key)).get()
    if (!row) return null
    // 如果已过期，返回 null
    if (row.expiresAt && row.expiresAt < Date.now()) return null
    return {
      key: row.key,
      domain: row.domain,
      value: JSON.parse(row.valueJson),
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
      sourceEventId: row.sourceEventId,
    }
  },

  /** 按 domain 获取所有有效状态 */
  getByDomain(domain: string): StateEntry[] {
    const db = getDb()
    const now = Date.now()
    const rows = db
      .select()
      .from(currentState)
      .where(eq(currentState.domain, domain))
      .all()

    return rows
      .filter((r) => !r.expiresAt || r.expiresAt >= now)
      .map((r) => ({
        key: r.key,
        domain: r.domain,
        value: JSON.parse(r.valueJson),
        expiresAt: r.expiresAt,
        updatedAt: r.updatedAt,
        sourceEventId: r.sourceEventId,
      }))
  },

  /** 模糊搜索状态（key LIKE） */
  search(keyPattern: string): StateEntry[] {
    const db = getDb()
    const now = Date.now()
    const rows = db
      .select()
      .from(currentState)
      .where(like(currentState.key, `%${keyPattern}%`))
      .all()

    return rows
      .filter((r) => !r.expiresAt || r.expiresAt >= now)
      .map((r) => ({
        key: r.key,
        domain: r.domain,
        value: JSON.parse(r.valueJson),
        expiresAt: r.expiresAt,
        updatedAt: r.updatedAt,
        sourceEventId: r.sourceEventId,
      }))
  },

  /** 删除一条状态 */
  delete(key: string): void {
    const db = getDb()
    db.delete(currentState).where(eq(currentState.key, key)).run()
  },

  /** 清理所有已过期的状态条目 */
  sweepExpired(): number {
    const db = getDb()
    const now = Date.now()
    const result = db
      .delete(currentState)
      .where(and(lt(currentState.expiresAt, now)))
      .run()
    return result.changes
  },
}
