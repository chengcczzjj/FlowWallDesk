import { ulid } from 'ulidx'
import { eq, desc, and, isNull, ne } from 'drizzle-orm'
import { getDb } from '../db/client'
import { conversations, events } from '../db/schema'
import type { ConversationMode } from '../events/types'

export interface ConversationRecord {
  id: string
  mode: ConversationMode
  projectId: string | null
  title: string | null
  createdAt: number
  updatedAt: number
  status: string
}

export const ConversationStore = {
  /** 获取已有会话或创建新会话 */
  getOrCreate(id: string | undefined, mode: ConversationMode = 'daily', projectId?: string | null): ConversationRecord {
    const db = getDb()
    if (id) {
      const existing = db.select().from(conversations).where(eq(conversations.id, id)).get()
      if (existing) return existing as ConversationRecord
    }
    return this.create(mode, projectId ?? undefined)
  },

  /** 创建新会话 */
  create(mode: ConversationMode = 'daily', projectId?: string, title?: string): ConversationRecord {
    const db = getDb()
    const now = Date.now()
    const id = ulid()
    const row = {
      id,
      mode,
      projectId: projectId ?? null,
      title: title ?? null,
      createdAt: now,
      updatedAt: now,
      status: 'active',
    }
    db.insert(conversations).values(row).run()
    return row
  },

  /** 列出所有活跃会话（最近的在前） */
  list(limit = 50): ConversationRecord[] {
    const db = getDb()
    return db
      .select()
      .from(conversations)
      .where(ne(conversations.status, 'deleted'))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .all() as ConversationRecord[]
  },

  /** 列出指定项目的会话 */
  listByProject(projectId: string, limit = 50): ConversationRecord[] {
    const db = getDb()
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.projectId, projectId), ne(conversations.status, 'deleted')))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .all() as ConversationRecord[]
  },

  /** 列出不属于任何项目的会话 */
  listWithoutProject(limit = 50): ConversationRecord[] {
    const db = getDb()
    return db
      .select()
      .from(conversations)
      .where(and(isNull(conversations.projectId), ne(conversations.status, 'deleted')))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .all() as ConversationRecord[]
  },

  /** 更新会话标题 */
  updateTitle(id: string, title: string): void {
    const db = getDb()
    db.update(conversations)
      .set({ title, updatedAt: Date.now() })
      .where(eq(conversations.id, id))
      .run()
  },

  /** 更新会话最后活跃时间 */
  touch(id: string): void {
    const db = getDb()
    db.update(conversations)
      .set({ updatedAt: Date.now() })
      .where(eq(conversations.id, id))
      .run()
  },

  /** 删除会话及其所有事件 */
  delete(id: string): void {
    const db = getDb()
    db.delete(events).where(eq(events.conversationId, id)).run()
    db.delete(conversations).where(eq(conversations.id, id)).run()
  },

  /** 归档会话 */
  archive(id: string): void {
    const db = getDb()
    db.update(conversations)
      .set({ status: 'archived', updatedAt: Date.now() })
      .where(eq(conversations.id, id))
      .run()
  },

  /** 取消归档 */
  unarchive(id: string): void {
    const db = getDb()
    db.update(conversations)
      .set({ status: 'active', updatedAt: Date.now() })
      .where(eq(conversations.id, id))
      .run()
  },

  /** 更新会话所属项目 */
  updateProject(id: string, projectId: string | null): void {
    const db = getDb()
    db.update(conversations)
      .set({ projectId, updatedAt: Date.now() })
      .where(eq(conversations.id, id))
      .run()
  },
}
