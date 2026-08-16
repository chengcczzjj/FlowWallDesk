import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  GripHorizontal,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { TodoTask, TodoWidgetConfig, WidgetInstance } from '@shared/types'
import {
  TODO_TASK_LIMIT,
  TODO_CATEGORY_META,
  createTodoDueAt,
  createTodoTask,
  formatTodoDueLabel,
  getTodoTaskBucket,
  getTodoWeekRange,
  inferTodoCategory,
  normalizeTodoWidgetConfig,
  sanitizeTodoTitle,
  setTodoTaskDone,
  summarizeTodoWeek,
} from '@shared/todo'
import { FrostedGlassBackground } from '../FrostedGlassBackground'
import './todo-board.css'

const BUCKET_META = {
  overdue: { label: '已逾期', tone: 'danger' },
  today: { label: '今天', tone: 'today' },
  upcoming: { label: '接下来', tone: 'future' },
  later: { label: '以后', tone: 'future' },
  undated: { label: '随手记', tone: 'plain' },
} as const

type DueChoice = 'none' | 'today' | 'tomorrow'

function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sortPendingTasks(tasks: TodoTask[]): TodoTask[] {
  const priorityOrder = { high: 0, normal: 1, low: 2 }
  return [...tasks].sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt
  })
}

export function TodoBoardWidget({ widget }: { widget: WidgetInstance }) {
  const incomingConfig = useMemo(() => normalizeTodoWidgetConfig(widget.config), [widget.config])
  const [config, setConfig] = useState<TodoWidgetConfig>(incomingConfig)
  const configRef = useRef(config)
  const [draft, setDraft] = useState('')
  const [dueChoice, setDueChoice] = useState<DueChoice>('none')
  const [highPriority, setHighPriority] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [now, setNow] = useState(Date.now())

  configRef.current = config

  useEffect(() => {
    setConfig(incomingConfig)
    configRef.current = incomingConfig
  }, [incomingConfig])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const persist = (next: TodoWidgetConfig): void => {
    setConfig(next)
    configRef.current = next
    void window.canvasBridge?.updateWidgetConfig(widget.id, { ...next })
  }

  const updateTasks = (updater: (tasks: TodoTask[]) => TodoTask[]): void => {
    const current = configRef.current
    persist({ ...current, tasks: updater(current.tasks) })
  }

  const addTask = (): void => {
    const title = sanitizeTodoTitle(draft)
    if (!title || configRef.current.tasks.length >= TODO_TASK_LIMIT) return
    const task = createTodoTask({
      id: createTaskId(),
      title,
      now,
      dueAt: createTodoDueAt(dueChoice, now),
      priority: highPriority ? 'high' : 'normal',
    })
    updateTasks((tasks) => [...tasks, task])
    setDraft('')
    setHighPriority(false)
  }

  const toggleTask = (taskId: string): void => {
    updateTasks((tasks) => tasks.map((task) => task.id === taskId ? setTodoTaskDone(task, !task.done, now) : task))
  }

  const deleteTask = (taskId: string): void => {
    updateTasks((tasks) => tasks.filter((task) => task.id !== taskId))
  }

  const saveEditedTitle = (): void => {
    if (!editingId) return
    const title = sanitizeTodoTitle(editingTitle)
    if (title) {
      updateTasks((tasks) => tasks.map((task) => task.id === editingId
        ? { ...task, title, category: inferTodoCategory(title), updatedAt: Date.now() }
        : task))
    }
    setEditingId(null)
    setEditingTitle('')
  }

  const pendingTasks = useMemo(() => sortPendingTasks(config.tasks.filter((task) => !task.done)), [config.tasks])
  const completedTasks = useMemo(() => config.tasks
    .filter((task) => task.done)
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)), [config.tasks])
  const overdueTasks = useMemo(() => pendingTasks.filter((task) => getTodoTaskBucket(task, now) === 'overdue'), [pendingTasks, now])
  const progress = config.tasks.length > 0 ? Math.round((completedTasks.length / config.tasks.length) * 100) : 0

  useEffect(() => {
    if (overdueTasks.length === 0 || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const reminderDate = new Date(now)
    const dateKey = `${reminderDate.getFullYear()}-${reminderDate.getMonth() + 1}-${reminderDate.getDate()}`
    for (const task of overdueTasks.filter((item) => item.remind)) {
      const notificationKey = `lingyue-todo-reminder:${task.id}:${dateKey}`
      if (localStorage.getItem(notificationKey)) continue
      localStorage.setItem(notificationKey, '1')
      new Notification('任务便笺提醒', { body: `${task.title} 已到期，记得安排一下。` })
    }
  }, [now, overdueTasks])

  const changeView = (view: TodoWidgetConfig['view']): void => {
    persist({ ...configRef.current, view })
  }

  return (
    <section className="todo-board" aria-label="桌面任务便笺">
      <FrostedGlassBackground overlayColor="rgba(255, 247, 225, 0.92)" blurPx={28} />
      <div className="todo-board__paper-grain" aria-hidden />
      <div className="todo-board__accent-spine" aria-hidden />
      <div
        className="todo-board__tape"
        data-widget-drag-handle
        title="拖动任务便笺"
        aria-label="拖动任务便笺"
      >
        <GripHorizontal size={18} />
      </div>

      <div className="todo-board__content">
        <header className="todo-board__header">
          <div className="todo-board__heading">
            <span className="todo-board__eyebrow">LINGYUE NOTE / {pendingTasks.length} OPEN</span>
            <h2>{config.title}</h2>
          </div>
          <div className="todo-board__progress" aria-label={`完成进度 ${progress}%`}>
            <strong>{progress}</strong>
            <span>%</span>
          </div>
        </header>

        <div className="todo-board__view-switch" role="tablist" aria-label="任务视图">
          <button type="button" role="tab" aria-selected={config.view === 'plan'} onClick={() => changeView('plan')}>
            <ListTodo size={14} />
            <span>计划</span>
          </button>
          <button type="button" role="tab" aria-selected={config.view === 'week'} onClick={() => changeView('week')}>
            <BarChart3 size={14} />
            <span>周记</span>
          </button>
          {overdueTasks.length > 0 && (
            <span className="todo-board__overdue-pill"><BellRing size={12} /> {overdueTasks.length} 项逾期</span>
          )}
        </div>

        <main className="todo-board__main">
          {config.view === 'plan' ? (
            <PlanView
              tasks={pendingTasks}
              completedTasks={completedTasks}
              now={now}
              editingId={editingId}
              editingTitle={editingTitle}
              onEditingTitleChange={setEditingTitle}
              onStartEdit={(task) => { setEditingId(task.id); setEditingTitle(task.title) }}
              onSaveEdit={saveEditedTitle}
              onCancelEdit={() => setEditingId(null)}
              onToggle={toggleTask}
              onDelete={deleteTask}
            />
          ) : (
            <WeekView
              config={config}
              now={now}
              onWeekChange={(weekOffset) => persist({ ...configRef.current, weekOffset })}
              onToggle={toggleTask}
            />
          )}
        </main>

        <footer className="todo-board__composer">
          <div className="todo-board__composer-row">
            <Plus size={17} aria-hidden />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addTask()
              }}
              placeholder="写下要做的事…"
              aria-label="新增任务"
            />
            <button type="button" className="todo-board__add-button" onClick={addTask} disabled={!sanitizeTodoTitle(draft) || config.tasks.length >= TODO_TASK_LIMIT}>
              记下
            </button>
          </div>
          <div className="todo-board__composer-options">
            <button
              type="button"
              data-active={dueChoice !== 'none'}
              onClick={() => setDueChoice((choice) => choice === 'none' ? 'today' : choice === 'today' ? 'tomorrow' : 'none')}
            >
              <CalendarDays size={12} />
              {dueChoice === 'today' ? '今天 21:00' : dueChoice === 'tomorrow' ? '明天 21:00' : '无截止'}
            </button>
            <button type="button" data-active={highPriority} onClick={() => setHighPriority((value) => !value)}>
              <Flag size={12} /> {highPriority ? '重要' : '普通'}
            </button>
            <span>自动识别工作 / 学习 / 生活 / 健康</span>
          </div>
        </footer>
      </div>
    </section>
  )
}

function PlanView({
  tasks,
  completedTasks,
  now,
  editingId,
  editingTitle,
  onEditingTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onDelete,
}: {
  tasks: TodoTask[]
  completedTasks: TodoTask[]
  now: number
  editingId: string | null
  editingTitle: string
  onEditingTitleChange: (value: string) => void
  onStartEdit: (task: TodoTask) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggle: (taskId: string) => void
  onDelete: (taskId: string) => void
}) {
  const sections = (Object.keys(BUCKET_META) as Array<keyof typeof BUCKET_META>)
    .map((bucket) => ({ bucket, tasks: tasks.filter((task) => getTodoTaskBucket(task, now) === bucket) }))
    .filter((section) => section.tasks.length > 0)

  if (tasks.length === 0 && completedTasks.length === 0) {
    return (
      <div className="todo-board__empty">
        <span className="todo-board__empty-mark"><Check size={22} /></span>
        <strong>纸面还是空的</strong>
        <p>在下方记一件事，它会自动分组并在到期时提醒你。</p>
      </div>
    )
  }

  return (
    <div className="todo-board__sections">
      {sections.map((section) => (
        <section key={section.bucket} className="todo-board__section">
          <div className="todo-board__section-title" data-tone={BUCKET_META[section.bucket].tone}>
            <span>{BUCKET_META[section.bucket].label}</span>
            <small>{section.tasks.length}</small>
          </div>
          {section.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              now={now}
              editing={editingId === task.id}
              editingTitle={editingTitle}
              onEditingTitleChange={onEditingTitleChange}
              onStartEdit={() => onStartEdit(task)}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onToggle={() => onToggle(task.id)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </section>
      ))}
      {completedTasks.length > 0 && (
        <section className="todo-board__section todo-board__section--done">
          <div className="todo-board__section-title" data-tone="done"><span>最近完成</span><small>{completedTasks.length}</small></div>
          {completedTasks.slice(0, 4).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              now={now}
              editing={false}
              editingTitle=""
              onEditingTitleChange={() => undefined}
              onStartEdit={() => undefined}
              onSaveEdit={() => undefined}
              onCancelEdit={() => undefined}
              onToggle={() => onToggle(task.id)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function TaskRow({
  task,
  now,
  editing,
  editingTitle,
  onEditingTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onDelete,
}: {
  task: TodoTask
  now: number
  editing: boolean
  editingTitle: string
  onEditingTitleChange: (value: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const overdue = getTodoTaskBucket(task, now) === 'overdue'
  return (
    <article className="todo-task" data-done={task.done} data-priority={task.priority}>
      <button type="button" className="todo-task__check" onClick={onToggle} aria-label={task.done ? '恢复任务' : '完成任务'}>
        {task.done && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="todo-task__body">
        {editing ? (
          <input
            className="todo-task__edit"
            autoFocus
            value={editingTitle}
            onChange={(event) => onEditingTitleChange(event.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSaveEdit()
              if (event.key === 'Escape') onCancelEdit()
            }}
          />
        ) : (
          <button type="button" className="todo-task__title" onDoubleClick={onStartEdit} onClick={task.done ? onToggle : undefined}>
            {task.title}
          </button>
        )}
        <div className="todo-task__meta">
          <span data-category={task.category}>{TODO_CATEGORY_META[task.category].label}</span>
          {task.dueAt !== undefined && <time data-overdue={overdue}>{overdue ? '已逾期 · ' : ''}{formatTodoDueLabel(task.dueAt, now)}</time>}
          {task.priority === 'high' && <span className="todo-task__important">重要</span>}
        </div>
      </div>
      {!task.done && (
        <button type="button" className="todo-task__action" onClick={onStartEdit} aria-label="编辑任务"><Pencil size={13} /></button>
      )}
      <button type="button" className="todo-task__action" onClick={onDelete} aria-label="删除任务"><Trash2 size={13} /></button>
    </article>
  )
}

function WeekView({
  config,
  now,
  onWeekChange,
  onToggle,
}: {
  config: TodoWidgetConfig
  now: number
  onWeekChange: (weekOffset: number) => void
  onToggle: (taskId: string) => void
}) {
  const summary = useMemo(() => summarizeTodoWeek(config.tasks, now, config.weekOffset), [config.tasks, config.weekOffset, now])
  const range = getTodoWeekRange(now, config.weekOffset)
  const maxCount = Math.max(1, ...summary.dayCounts)
  const weekdays = ['一', '二', '三', '四', '五', '六', '日']
  const dateLabel = `${new Date(range.start).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} - ${new Date(range.end).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`

  return (
    <div className="todo-week">
      <div className="todo-week__nav">
        <button type="button" onClick={() => onWeekChange(Math.max(-52, config.weekOffset - 1))} aria-label="上一周"><ChevronLeft size={15} /></button>
        <div><strong>{config.weekOffset === 0 ? '本周' : config.weekOffset === -1 ? '上周' : '历史周记'}</strong><span>{dateLabel}</span></div>
        <button type="button" disabled={config.weekOffset >= 0} onClick={() => onWeekChange(Math.min(0, config.weekOffset + 1))} aria-label="下一周"><ChevronRight size={15} /></button>
      </div>

      <div className="todo-week__summary">
        <p>{summary.headline}</p>
        <div className="todo-week__metrics">
          <span><strong>{summary.completed.length}</strong> 完成</span>
          <span><strong>{summary.completionRate}%</strong> 收尾率</span>
          <span><strong>{summary.activeDays}</strong> 活跃天</span>
        </div>
      </div>

      <div className="todo-week__chart" aria-label="每日完成数量">
        {summary.dayCounts.map((count, index) => (
          <div key={weekdays[index]}>
            <span className="todo-week__bar-track"><i style={{ height: `${Math.max(count > 0 ? 16 : 4, count / maxCount * 100)}%` }} /></span>
            <small>{weekdays[index]}</small>
          </div>
        ))}
      </div>

      <div className="todo-week__completed">
        <div className="todo-week__completed-title"><span>这一周完成了</span><small>{summary.completed.length}</small></div>
        {summary.completed.length === 0 ? (
          <p className="todo-week__empty">还没有完成记录，先从一件小事开始。</p>
        ) : summary.completed.slice(0, 8).map((task) => (
          <button type="button" key={task.id} onClick={() => onToggle(task.id)}>
            <span><Check size={11} /></span>
            <strong>{task.title}</strong>
            <small>{TODO_CATEGORY_META[task.category].label}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
