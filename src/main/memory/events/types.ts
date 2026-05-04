import { z } from 'zod'

export const ConversationMode = z.enum(['daily', 'work', 'private', 'tool'])
export type ConversationMode = z.infer<typeof ConversationMode>

export const EventType = z.enum([
  'user_message',
  'assistant_message',
  'tool_call',
  'tool_result',
  'system_event',
])
export type EventType = z.infer<typeof EventType>

export const Sensitivity = z.enum(['normal', 'sensitive', 'private'])
export type Sensitivity = z.infer<typeof Sensitivity>

export const SummaryStatus = z.enum(['pending', 'summarized', 'ignored'])
export type SummaryStatus = z.infer<typeof SummaryStatus>

/** 写入 EventStore 的参数校验 */
export const AppendEventInput = z.object({
  conversationId: z.string(),
  projectId: z.string().optional(),
  eventType: EventType,
  mode: ConversationMode,
  content: z.record(z.string(), z.unknown()),
  sensitivity: Sensitivity.optional().default('normal'),
})
export type AppendEventInput = z.infer<typeof AppendEventInput>

/** 从数据库读取的事件记录 */
export interface StoredEvent {
  id: string
  conversationId: string
  projectId: string | null
  eventType: EventType
  mode: ConversationMode
  content: Record<string, unknown>
  sensitivity: Sensitivity
  createdAt: number
  summaryStatus: SummaryStatus
}
