import { ulid } from 'ulidx'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { events } from '../db/schema'
import { AppendEventInput, type StoredEvent } from './types'

export const EventStore = {
  /** 追加事件（用户消息/AI回复/工具调用等） */
  append(input: unknown): StoredEvent {
    const parsed = AppendEventInput.parse(input)
    const db = getDb()
    const now = Date.now()
    const id = ulid()
    const row = {
      id,
      conversationId: parsed.conversationId,
      projectId: parsed.projectId ?? null,
      eventType: parsed.eventType,
      mode: parsed.mode,
      contentJson: JSON.stringify(parsed.content),
      sensitivity: parsed.sensitivity,
      createdAt: now,
      summaryStatus: 'pending' as const,
    }
    db.insert(events).values(row).run()
    return {
      id,
      conversationId: parsed.conversationId,
      projectId: parsed.projectId ?? null,
      eventType: parsed.eventType,
      mode: parsed.mode,
      content: parsed.content,
      sensitivity: parsed.sensitivity,
      createdAt: now,
      summaryStatus: 'pending',
    }
  },

  /** 获取某会话最近 N 条事件 */
  listRecent(conversationId: string, limit = 20): StoredEvent[] {
    const db = getDb()
    const rows = db
      .select()
      .from(events)
      .where(eq(events.conversationId, conversationId))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .all()
      .reverse() // 返回按时间正序

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      projectId: r.projectId,
      eventType: r.eventType as StoredEvent['eventType'],
      mode: r.mode as StoredEvent['mode'],
      content: JSON.parse(r.contentJson),
      sensitivity: r.sensitivity as StoredEvent['sensitivity'],
      createdAt: r.createdAt,
      summaryStatus: r.summaryStatus as StoredEvent['summaryStatus'],
    }))
  },
}
