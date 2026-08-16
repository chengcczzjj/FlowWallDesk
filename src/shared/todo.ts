import type { TodoTask, TodoTaskCategory, TodoTaskPriority, TodoWidgetConfig } from './types'

export const TODO_TASK_LIMIT = 120
export const TODO_TITLE_LIMIT = 160

export const TODO_CATEGORY_META: Record<TodoTaskCategory, { label: string; shortLabel: string }> = {
  work: { label: '工作', shortLabel: '工' },
  study: { label: '学习', shortLabel: '学' },
  life: { label: '生活', shortLabel: '生' },
  health: { label: '健康', shortLabel: '健' },
  other: { label: '其他', shortLabel: '其' },
}

export const DEFAULT_TODO_WIDGET_CONFIG: TodoWidgetConfig = {
  version: 1,
  title: '今日纸条',
  tasks: [],
  view: 'plan',
  weekOffset: 0,
}

const CATEGORY_KEYWORDS: Record<Exclude<TodoTaskCategory, 'other'>, RegExp> = {
  work: /工作|会议|汇报|周报|客户|项目|需求|版本|发布|邮件|合同|报表|复盘|同事|office|meeting|project|report|email/i,
  study: /学习|阅读|课程|作业|考试|背诵|练习|论文|笔记|教程|单词|study|learn|read|course|exam/i,
  health: /健身|跑步|散步|运动|喝水|睡眠|体检|吃药|瑜伽|拉伸|训练|workout|run|walk|health|medicine/i,
  life: /买菜|购物|快递|家务|缴费|做饭|打扫|洗衣|旅行|预约|家人|朋友|生日|生活|shop|home|family|travel/i,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readCategory(value: unknown): TodoTaskCategory | undefined {
  return value === 'work' || value === 'study' || value === 'life' || value === 'health' || value === 'other'
    ? value
    : undefined
}

function readPriority(value: unknown): TodoTaskPriority {
  return value === 'high' || value === 'low' ? value : 'normal'
}

export function sanitizeTodoTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TODO_TITLE_LIMIT) : ''
}

export function inferTodoCategory(title: string): TodoTaskCategory {
  const explicit = [
    ['work', /#(?:工作|work)/i],
    ['study', /#(?:学习|study)/i],
    ['life', /#(?:生活|life)/i],
    ['health', /#(?:健康|health)/i],
  ] as const
  for (const [category, pattern] of explicit) {
    if (pattern.test(title)) return category
  }
  for (const category of ['work', 'study', 'health', 'life'] as const) {
    if (CATEGORY_KEYWORDS[category].test(title)) return category
  }
  return 'other'
}

export function normalizeTodoTask(value: unknown, index = 0, now = Date.now()): TodoTask | null {
  if (!isRecord(value)) return null
  const title = sanitizeTodoTitle(value.title)
  if (!title) return null
  const createdAt = readFiniteNumber(value.createdAt) ?? now
  const done = value.done === true
  const completedAt = done ? readFiniteNumber(value.completedAt) ?? readFiniteNumber(value.updatedAt) ?? now : undefined
  const dueAt = readFiniteNumber(value.dueAt)
  const rawId = typeof value.id === 'string' ? value.id.trim().slice(0, 120) : ''
  return {
    id: rawId || `task-${createdAt}-${index}`,
    title,
    done,
    createdAt,
    updatedAt: readFiniteNumber(value.updatedAt) ?? createdAt,
    completedAt,
    dueAt,
    category: readCategory(value.category) ?? inferTodoCategory(title),
    priority: readPriority(value.priority),
    remind: value.remind !== false,
  }
}

export function normalizeTodoTasks(value: unknown, now = Date.now()): TodoTask[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tasks: TodoTask[] = []
  for (let index = 0; index < value.length && tasks.length < TODO_TASK_LIMIT; index += 1) {
    const normalized = normalizeTodoTask(value[index], index, now)
    if (!normalized || seen.has(normalized.id)) continue
    seen.add(normalized.id)
    tasks.push(normalized)
  }
  return tasks
}

export function normalizeTodoWidgetConfig(value: unknown, now = Date.now()): TodoWidgetConfig {
  const source = isRecord(value) ? value : {}
  const title = sanitizeTodoTitle(source.title).slice(0, 40) || DEFAULT_TODO_WIDGET_CONFIG.title
  const rawWeekOffset = readFiniteNumber(source.weekOffset) ?? 0
  return {
    version: 1,
    title,
    tasks: normalizeTodoTasks(source.tasks, now),
    view: source.view === 'week' ? 'week' : 'plan',
    weekOffset: Math.max(-52, Math.min(1, Math.round(rawWeekOffset))),
  }
}

export function createTodoTask(params: {
  id: string
  title: string
  now?: number
  dueAt?: number
  category?: TodoTaskCategory
  priority?: TodoTaskPriority
  remind?: boolean
}): TodoTask {
  const now = params.now ?? Date.now()
  const title = sanitizeTodoTitle(params.title)
  return {
    id: params.id.slice(0, 120),
    title,
    done: false,
    createdAt: now,
    updatedAt: now,
    dueAt: readFiniteNumber(params.dueAt),
    category: params.category ?? inferTodoCategory(title),
    priority: params.priority ?? 'normal',
    remind: params.remind !== false,
  }
}

export function setTodoTaskDone(task: TodoTask, done: boolean, now = Date.now()): TodoTask {
  return {
    ...task,
    done,
    updatedAt: now,
    completedAt: done ? now : undefined,
  }
}

export function startOfLocalDay(value: number | Date): number {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function endOfLocalDay(value: number | Date): number {
  const date = new Date(startOfLocalDay(value))
  date.setDate(date.getDate() + 1)
  return date.getTime() - 1
}

export function createTodoDueAt(kind: 'none' | 'today' | 'tomorrow', now = Date.now()): number | undefined {
  if (kind === 'none') return undefined
  const date = new Date(now)
  if (kind === 'tomorrow') date.setDate(date.getDate() + 1)
  date.setHours(21, 0, 0, 0)
  return date.getTime()
}

export type TodoTaskBucket = 'overdue' | 'today' | 'upcoming' | 'later' | 'undated' | 'done'

export function getTodoTaskBucket(task: TodoTask, now = Date.now()): TodoTaskBucket {
  if (task.done) return 'done'
  if (task.dueAt === undefined) return 'undated'
  const todayStart = startOfLocalDay(now)
  const todayEnd = endOfLocalDay(now)
  if (task.dueAt < todayStart) return 'overdue'
  if (task.dueAt <= todayEnd) return 'today'
  const upcomingEnd = new Date(todayStart)
  upcomingEnd.setDate(upcomingEnd.getDate() + 7)
  if (task.dueAt < upcomingEnd.getTime()) return 'upcoming'
  return 'later'
}

export function getTodoWeekRange(now = Date.now(), weekOffset = 0): { start: number; end: number; days: number[] } {
  const date = new Date(startOfLocalDay(now))
  const day = date.getDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - daysSinceMonday + weekOffset * 7)
  const start = date.getTime()
  const days = Array.from({ length: 7 }, (_, index) => {
    const item = new Date(start)
    item.setDate(item.getDate() + index)
    return item.getTime()
  })
  const endDate = new Date(start)
  endDate.setDate(endDate.getDate() + 7)
  return { start, end: endDate.getTime() - 1, days }
}

export interface TodoWeekSummary {
  completed: TodoTask[]
  unfinished: TodoTask[]
  plannedCount: number
  completionRate: number
  activeDays: number
  dayCounts: number[]
  headline: string
}

export function summarizeTodoWeek(tasks: TodoTask[], now = Date.now(), weekOffset = 0): TodoWeekSummary {
  const { start, end, days } = getTodoWeekRange(now, weekOffset)
  const completed = tasks
    .filter((task) => task.done && task.completedAt !== undefined && task.completedAt >= start && task.completedAt <= end)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const unfinished = tasks
    .filter((task) => !task.done && task.createdAt <= end && (task.dueAt === undefined || task.dueAt <= end))
    .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
  const plannedIds = new Set<string>([
    ...completed.map((task) => task.id),
    ...unfinished.map((task) => task.id),
  ])
  const dayCounts = days.map((dayStart) => {
    const dayEnd = endOfLocalDay(dayStart)
    return completed.filter((task) => (task.completedAt ?? 0) >= dayStart && (task.completedAt ?? 0) <= dayEnd).length
  })
  const activeDays = dayCounts.filter((count) => count > 0).length
  const plannedCount = plannedIds.size
  const completionRate = plannedCount > 0 ? Math.round((completed.length / plannedCount) * 100) : 0
  const bestCount = Math.max(...dayCounts)
  const weekday = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const bestDay = bestCount > 0 ? weekday[dayCounts.indexOf(bestCount)] : ''
  const headline = completed.length === 0
    ? unfinished.length > 0
      ? `这一周还没有完成记录，有 ${unfinished.length} 项可以继续推进。`
      : '这一周很轻盈，还没有任务记录。'
    : `这一周完成 ${completed.length} 项${bestDay ? `，${bestDay}最有进展` : ''}${unfinished.length > 0 ? `，还有 ${unfinished.length} 项未收尾。` : '，所有计划都收尾了。'}`
  return { completed, unfinished, plannedCount, completionRate, activeDays, dayCounts, headline }
}

export function formatTodoDueLabel(dueAt: number | undefined, now = Date.now()): string {
  if (dueAt === undefined) return ''
  const dueDay = startOfLocalDay(dueAt)
  const today = startOfLocalDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dueDay === today) return new Date(dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (dueDay === tomorrow.getTime()) return '明天'
  return new Date(dueAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
