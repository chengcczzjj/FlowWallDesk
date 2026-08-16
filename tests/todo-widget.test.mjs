import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'
import {
  createTodoTask,
  getTodoTaskBucket,
  getTodoWeekRange,
  inferTodoCategory,
  normalizeTodoTasks,
  setTodoTaskDone,
  summarizeTodoWeek,
} from '../src/shared/todo.ts'
import { DEFAULT_WIDGET_SIZE_BY_TYPE, WIDGET_TYPES, getWidgetCapability } from '../src/shared/desktop-scene.ts'
import { getToolManifest } from '../src/shared/tool-manifest.ts'

test('todo board is a first-class widget and AI tool capability', () => {
  assert.ok(WIDGET_TYPES.includes('todo-board'))
  assert.deepEqual(DEFAULT_WIDGET_SIZE_BY_TYPE['todo-board'], { width: 420, height: 520 })
  assert.equal(getWidgetCapability('todo-board')?.minSize?.width, 320)
  assert.equal(getToolManifest('manage_todo_tasks')?.category, 'widget')
})

test('todo tape drag handle wins before generic interactive target blocking', async () => {
  const canvasSource = await readFile(new URL('../src/renderer/canvas/Canvas.tsx', import.meta.url), 'utf8')
  const todoSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/TodoBoard.tsx', import.meta.url), 'utf8')
  const handleBranch = canvasSource.indexOf("if (canLongPressDrag && target.closest('[data-widget-drag-handle]'))")
  const interactiveBlock = canvasSource.indexOf('if (isWidgetInteractionTarget(target)) return', handleBranch)
  assert.ok(handleBranch >= 0)
  assert.ok(interactiveBlock > handleBranch)
  assert.match(todoSource, /data-widget-drag-handle/)
})

test('todo titles are automatically classified into useful desktop categories', () => {
  assert.equal(inferTodoCategory('准备明天的客户汇报'), 'work')
  assert.equal(inferTodoCategory('阅读 TypeScript 教程'), 'study')
  assert.equal(inferTodoCategory('晚饭后跑步 5 公里'), 'health')
  assert.equal(inferTodoCategory('下班买菜'), 'life')
  assert.equal(inferTodoCategory('想一个周末小目标'), 'other')
})

test('todo task normalization rejects empty rows and de-duplicates ids', () => {
  const tasks = normalizeTodoTasks([
    { id: 'a', title: '  完成 周报  ', done: false, createdAt: 100 },
    { id: 'a', title: '重复项', done: false, createdAt: 100 },
    { id: 'b', title: '   ' },
  ], 200)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].title, '完成 周报')
  assert.equal(tasks[0].category, 'work')
})

test('todo buckets separate overdue, today and future tasks', () => {
  const now = new Date(2026, 7, 16, 12).getTime()
  const overdue = createTodoTask({ id: 'overdue', title: '过期任务', now, dueAt: new Date(2026, 7, 15, 21).getTime() })
  const today = createTodoTask({ id: 'today', title: '今天任务', now, dueAt: new Date(2026, 7, 16, 21).getTime() })
  const future = createTodoTask({ id: 'future', title: '未来任务', now, dueAt: new Date(2026, 7, 18, 21).getTime() })
  assert.equal(getTodoTaskBucket(overdue, now), 'overdue')
  assert.equal(getTodoTaskBucket(today, now), 'today')
  assert.equal(getTodoTaskBucket(future, now), 'upcoming')
})

test('weekly summary keeps completion history and unfinished carry-over', () => {
  const now = new Date(2026, 7, 16, 12).getTime()
  const range = getTodoWeekRange(now)
  const task = createTodoTask({ id: 'done', title: '完成设计', now: range.start + 1_000 })
  const completed = setTodoTaskDone(task, true, range.start + 86_400_000)
  const unfinished = createTodoTask({ id: 'open', title: '继续验收', now: range.start + 2_000, dueAt: range.end - 1_000 })
  const summary = summarizeTodoWeek([completed, unfinished], now)
  assert.equal(summary.completed.length, 1)
  assert.equal(summary.unfinished.length, 1)
  assert.equal(summary.plannedCount, 2)
  assert.equal(summary.completionRate, 50)
  assert.equal(summary.activeDays, 1)
  assert.match(summary.headline, /完成 1 项/)
})
