/**
 * 记忆工具 — 允许 AI 主动存取用户相关信息
 *
 * memory_store: AI 主动记住重要信息（用户偏好、事实等）
 * memory_recall: AI 回忆之前存储的信息
 *
 * 当前实现使用 SQLite 的 memories 表（简单 key-value + 全文搜索）
 * 后续 Phase 4-5 将升级为向量检索
 */
import { tool } from 'ai'
import { z } from 'zod'
import { getDb } from '../../../memory/db/client'
import { memories } from '../../../memory/db/schema'
import { eq, like, desc } from 'drizzle-orm'
import { ulid } from 'ulidx'

export const memoryStoreTool = tool({
  description:
    '将重要信息存入长期记忆。当你发现用户透露了偏好、习惯、重要事实（如生日、名字、喜好、工作）时主动使用，下次对话可以回忆起来。',
  inputSchema: z.object({
    key: z.string().describe('记忆的简短标签/分类，如 "用户生日"、"喜欢的颜色"、"工作信息"'),
    content: z.string().describe('要记住的具体内容'),
    importance: z.enum(['low', 'medium', 'high']).optional().describe('重要程度'),
  }),
  execute: async ({ key, content, importance = 'medium' }) => {
    try {
      const db = getDb()
      const id = ulid()
      const now = Date.now()

      // 检查是否已有同 key 的记忆，有则更新
      const existing = db.select().from(memories).where(eq(memories.key, key)).get()
      if (existing) {
        db.update(memories)
          .set({ content, importance, updatedAt: now })
          .where(eq(memories.key, key))
          .run()
        return { success: true, action: 'updated', key }
      }

      db.insert(memories).values({
        id,
        key,
        content,
        importance,
        scope: 'user',
        createdAt: now,
        updatedAt: now,
      }).run()

      return { success: true, action: 'created', key }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  },
})

export const memoryRecallTool = tool({
  description:
    '回忆之前存储的用户信息。当你需要查找用户之前说过的偏好、事实等信息时使用。可以用关键词模糊搜索。',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词，会在标签和内容中模糊匹配'),
    limit: z.number().optional().describe('返回结果数量上限，默认 5'),
  }),
  execute: async ({ query, limit = 5 }) => {
    try {
      const db = getDb()
      const pattern = `%${query}%`

      const results = db
        .select()
        .from(memories)
        .where(like(memories.key, pattern))
        .orderBy(desc(memories.updatedAt))
        .limit(limit)
        .all()

      // 也搜索 content
      const contentResults = db
        .select()
        .from(memories)
        .where(like(memories.content, pattern))
        .orderBy(desc(memories.updatedAt))
        .limit(limit)
        .all()

      // 合并去重
      const seen = new Set<string>()
      const merged = [...results, ...contentResults].filter((r) => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      }).slice(0, limit)

      if (merged.length === 0) {
        return { query, found: false, memories: [] }
      }

      return {
        query,
        found: true,
        memories: merged.map((m) => ({
          key: m.key,
          content: m.content,
          importance: m.importance,
          updatedAt: m.updatedAt,
        })),
      }
    } catch (e) {
      return { query, found: false, error: (e as Error).message, memories: [] }
    }
  },
})
