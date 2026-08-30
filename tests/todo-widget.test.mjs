import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'
import {
  collectTodoTasks,
  createTodoTask,
  createTodoWidgetConfig,
  DEFAULT_TODO_TEXT_STYLE,
  getTodoTaskBucket,
  getTodoWeekRange,
  inferTodoCategory,
  migrateTodoWidgetInstance,
  normalizeTodoWidgetConfig,
  normalizeTodoTasks,
  setTodoTaskDone,
  summarizeTodoWeek,
} from '../src/shared/todo.ts'
import { DEFAULT_WIDGET_SIZE_BY_TYPE, WIDGET_TYPES, getWidgetCapability } from '../src/shared/desktop-scene.ts'
import { getToolManifest } from '../src/shared/tool-manifest.ts'

test('todo board is a first-class widget and AI tool capability', () => {
  assert.ok(WIDGET_TYPES.includes('todo-board'))
  assert.deepEqual(DEFAULT_WIDGET_SIZE_BY_TYPE['todo-board'], { width: 220, height: 190 })
  assert.equal(getWidgetCapability('todo-board')?.minSize?.width, 150)
  assert.equal(getWidgetCapability('todo-board')?.maxSize?.height, 380)
  assert.equal(getWidgetCapability('todo-board')?.allowMultiple, true)
  assert.equal(getToolManifest('manage_todo_tasks')?.category, 'widget')
})

test('sticky notes use direct freeform drag and resize without edit mode or collision resolution', async () => {
  const canvasSource = await readFile(new URL('../src/renderer/canvas/Canvas.tsx', import.meta.url), 'utf8')
  const canvasWindowSource = await readFile(new URL('../src/main/windows/canvasWindow.ts', import.meta.url), 'utf8')
  const mainSource = await readFile(new URL('../src/main/ipc/widgetIpc.ts', import.meta.url), 'utf8')
  const preloadSource = await readFile(new URL('../src/preload/canvas.ts', import.meta.url), 'utf8')
  const todoSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/TodoBoard.tsx', import.meta.url), 'utf8')
  assert.match(canvasSource, /directManipulation && !isWidgetInteractionTarget\(target\)/)
  assert.match(canvasSource, /resizeEdge && canResize && \(editing \|\| directManipulation\)/)
  assert.match(canvasSource, /if \(!directManipulation\) onDragPreview/)
  assert.match(canvasSource, /if \(!directManipulation\) onResolveCollisions/)
  assert.match(canvasSource, /onPointerDownCapture=\{onPointerDownCapture\}/)
  assert.match(canvasSource, /e\.button === 0 && directManipulation\) onBringToFront\(\)/)
  assert.match(canvasSource, /flushSync\(\(\) =>/)
  assert.match(canvasSource, /moveWidgetToFront\(current, id\)/)
  assert.match(canvasSource, /void window\.canvasBridge\?\.bringWidgetToFront\(id\)/)
  assert.match(mainSource, /'generated-widget', 'todo-board'/)
  assert.match(mainSource, /isFreeformStickyNote\(w\.type\)[\s\S]*clampStickyNotePosition/)
  assert.match(mainSource, /findStickyNotePlacement/)
  assert.match(todoSource, /data-widget-drag-handle/)
  assert.match(todoSource, /data-resize="br"/)
  assert.match(todoSource, /className="sticky-note__add-button"/)
  assert.match(preloadSource, /addWidget: \(w: WidgetInstance\): Promise<WidgetInstance\[\]>/)
  assert.match(canvasSource, /onPointerReset\(\(\) =>/)
  assert.match(canvasSource, /pointerGateRef\.current\.reset\(\)/)
  assert.match(canvasWindowSource, /CANVAS_POINTER_RESET/)
})

test('desktop note editing opens a scoped keyboard-focus session without entering global edit mode', async () => {
  const todoSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/TodoBoard.tsx', import.meta.url), 'utf8')
  const canvasWindowSource = await readFile(new URL('../src/main/windows/canvasWindow.ts', import.meta.url), 'utf8')
  const preloadSource = await readFile(new URL('../src/preload/canvas.ts', import.meta.url), 'utf8')
  const ipcSource = await readFile(new URL('../src/shared/ipc-channels.ts', import.meta.url), 'utf8')
  assert.match(ipcSource, /CANVAS_SET_TEXT_INPUT_ACTIVE/)
  assert.match(preloadSource, /setTextInputActive: \(active: boolean\): Promise<boolean>/)
  assert.match(todoSource, /setTextInputActive\(true\)[\s\S]*editorRef\.current\?\.focus\(\)/)
  assert.match(todoSource, /setTextInputActive\(false\)/)
  assert.match(todoSource, /contentEditable/)
  assert.match(todoSource, /className="sticky-note__formatbar"/)
  assert.match(todoSource, /document\.execCommand\(FORMAT_COMMANDS\[format\]/)
  assert.match(canvasWindowSource, /editing: isEditing \|\| canvasTextInputActive/)
  assert.match(canvasWindowSource, /export function setCanvasTextInputActive[\s\S]*win\.setFocusable\(true\)[\s\S]*win\.webContents\.focus\(\)/)
  assert.doesNotMatch(todoSource, /setEditMode\(/)
})

test('sticky note typography and controls reflow for narrow, short and large paper sizes', async () => {
  const cssSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/todo-board.css', import.meta.url), 'utf8')
  assert.match(cssSource, /font-size: clamp\(10px, min\(var\(--sticky-font-size\), 6cqh, 5\.8cqw\), 24px\)/)
  assert.match(cssSource, /@container \(max-width: 185px\)/)
  assert.match(cssSource, /@container \(max-height: 140px\)[\s\S]*sticky-note__topbar \{ height: 28px;/)
  assert.match(cssSource, /@container \(min-width: 300px\) and \(min-height: 240px\)/)
  assert.match(cssSource, /sticky-note\[data-empty="true"\]/)
  assert.match(cssSource, /sticky-note__formatbar/)
})

test('new sticky notes use a compact default body font size', () => {
  assert.equal(DEFAULT_TODO_TEXT_STYLE.fontSize, 12)
  assert.equal(createTodoWidgetConfig().textStyle.fontSize, 12)
})

test('desktop note uses system typography and exposes simple color and category controls', async () => {
  const todoSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/TodoBoard.tsx', import.meta.url), 'utf8')
  const cssSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/todo-board.css', import.meta.url), 'utf8')
  assert.match(cssSource, /font-family: system-ui, "Segoe UI", "Microsoft YaHei UI", sans-serif/)
  assert.doesNotMatch(cssSource, /Segoe Print|KaiTi/)
  assert.match(todoSource, /aria-label="\u8bbe\u7f6e\u4fbf\u7b3a\u989c\u8272\u548c\u5206\u7c7b"/)
  assert.match(todoSource, /const changeColor[\s\S]*persistConfig\(\{ color \}\)/)
  assert.match(todoSource, /const changeCategory[\s\S]*persistConfig\(\{ task: \{ \.\.\.config\.task, category, updatedAt: Date\.now\(\) \} \}\)/)
  assert.match(todoSource, /TODO_NOTE_COLORS\.map\(/)
  assert.match(todoSource, /TODO_CATEGORIES\.map\(/)
  assert.match(todoSource, /menuButtonRef\.current\?\.contains\(target\)/)
})

test('one sticky note stores one task and keeps physical paper choices', () => {
  const task = createTodoTask({ id: 'single', title: '只做这一件事', now: 100 })
  const config = createTodoWidgetConfig({ task, color: 'mint', paperStyle: 'pin', rotation: 2.2 })
  const normalized = normalizeTodoWidgetConfig(config, 200)
  assert.equal(normalized.version, 2)
  assert.equal(normalized.task?.id, 'single')
  assert.equal(normalized.color, 'mint')
  assert.equal(normalized.paperStyle, 'pin')
  assert.equal(normalized.rotation, 2.2)
  assert.equal(normalized.textStyle.fontFamily, 'system')
  assert.equal(normalized.textStyle.bold, false)
  assert.equal('tasks' in normalized, false)
})

test('sticky note text style and rich body content normalize within bounds', () => {
  const normalized = normalizeTodoWidgetConfig({
    version: 2,
    textStyle: { fontFamily: 'mono', fontSize: 80, bold: true, italic: true, underline: true, strike: true },
    bodyHtml: '<b>保留</b><script>丢弃</script>',
  })
  assert.equal(normalized.textStyle.fontFamily, 'mono')
  assert.equal(normalized.textStyle.fontSize, 36)
  assert.equal(normalized.textStyle.bold, true)
  assert.equal(normalized.bodyHtml, '<b>保留</b><script>丢弃</script>')
})

test('legacy task boards migrate into overlapping independent notes without losing completed history', () => {
  const legacy = {
    id: 'todo-board-old', type: 'todo-board', x: 500, y: 120, width: 420, height: 520, enabled: true,
    config: {
      version: 1, title: '今日纸条', view: 'plan', weekOffset: 0,
      tasks: [
        { id: 'open', title: '继续设计', done: false, createdAt: 100 },
        { id: 'done', title: '完成调研', done: true, createdAt: 100, completedAt: 180 },
      ],
    },
  }
  const migrated = migrateTodoWidgetInstance(legacy, 200)
  assert.equal(migrated.length, 2)
  assert.equal(migrated[0].id, legacy.id)
  assert.equal(migrated[0].width, 220)
  assert.equal(migrated[1].x, migrated[0].x + 26)
  assert.equal(migrated[1].y, migrated[0].y + 22)
  assert.equal(migrated[1].enabled, false)
  assert.equal(normalizeTodoWidgetConfig(migrated[1].config, 200).task?.completedAt, 180)
})

test('task aggregation includes visible, hidden and completed sticky-note instances', () => {
  const active = createTodoTask({ id: 'active', title: '桌面可见', now: 100 })
  const hidden = createTodoTask({ id: 'hidden', title: '暂时隐藏', now: 100 })
  const completed = setTodoTaskDone(createTodoTask({ id: 'done', title: '已经撕下', now: 100 }), true, 180)
  const widgets = [active, hidden, completed].map((task, index) => ({
    id: `note-${index}`, type: 'todo-board', x: index * 10, y: index * 10, width: 220, height: 190,
    enabled: index === 0,
    config: { ...createTodoWidgetConfig({ task }) },
  }))
  assert.deepEqual(collectTodoTasks(widgets, 200).map((task) => task.id), ['active', 'hidden', 'done'])
})

test('completion requests a tear animation before preserving the widget as hidden history', async () => {
  const todoSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/TodoBoard.tsx', import.meta.url), 'utf8')
  const cssSource = await readFile(new URL('../src/renderer/widgets/TodoBoard/todo-board.css', import.meta.url), 'utf8')
  assert.match(todoSource, /tearRequestedAt: requestedAt/)
  assert.match(todoSource, /updateWidget\(\{ \.\.\.widget, enabled: false/)
  assert.match(cssSource, /@keyframes sticky-note-tear-off[\s\S]*48% \{[\s\S]*clip-path: polygon\(48% 0/)
  assert.match(cssSource, /@keyframes sticky-note-tear-edge[\s\S]*left: calc\(100% - 5px\)/)
  assert.match(cssSource, /animation: sticky-note-tear-off 540ms/)
  assert.doesNotMatch(cssSource, /translate3d\(32px, 190%, 0\)|translate3d\(-5px, 52px, 0\)/)
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
