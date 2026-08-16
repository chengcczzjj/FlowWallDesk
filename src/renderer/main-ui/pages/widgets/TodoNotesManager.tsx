import { useMemo, useState } from 'react'
import {
  Archive,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Paperclip,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type {
  TodoNoteColor,
  TodoNotePaperStyle,
  TodoTask,
  TodoWidgetConfig,
  WidgetInstance,
} from '@shared/types'
import {
  TODO_CATEGORY_META,
  TODO_NOTE_COLORS,
  collectTodoTasks,
  createTodoDueAt,
  createTodoTask,
  createTodoWidgetConfig,
  formatTodoDueLabel,
  getTodoTaskBucket,
  getTodoWeekRange,
  inferTodoCategory,
  normalizeTodoWidgetConfig,
  sanitizeTodoTitle,
  setTodoTaskDone,
  summarizeTodoWeek,
} from '@shared/todo'

type ManagerTab = 'active' | 'week' | 'archive'
type DueChoice = 'none' | 'today' | 'tomorrow'

const COLOR_LABELS: Record<TodoNoteColor, string> = {
  butter: '奶油黄',
  rose: '珊瑚粉',
  mint: '薄荷绿',
  sky: '雾霭蓝',
  lilac: '丁香灰',
}

const PAPER_LABELS: Record<TodoNotePaperStyle, string> = {
  tape: '纸胶带',
  pin: '图钉',
  plain: '自然贴',
}

const BUCKET_LABELS = {
  overdue: '已经逾期',
  today: '今天要做',
  upcoming: '接下来七天',
  later: '以后',
  undated: '没有日期',
} as const

interface TodoNoteRecord {
  widget: WidgetInstance
  config: TodoWidgetConfig
  task?: TodoTask
}

export function TodoNotesManager({
  instances,
  onCreate,
  onRemove,
  onRefresh,
}: {
  instances: WidgetInstance[]
  onCreate: (config: TodoWidgetConfig) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [tab, setTab] = useState<ManagerTab>('active')
  const [draft, setDraft] = useState('')
  const [dueChoice, setDueChoice] = useState<DueChoice>('none')
  const [color, setColor] = useState<TodoNoteColor>('butter')
  const [paperStyle, setPaperStyle] = useState<TodoNotePaperStyle>('tape')
  const [highPriority, setHighPriority] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

  const notes = useMemo<TodoNoteRecord[]>(() => instances
    .filter((widget) => widget.type === 'todo-board')
    .map((widget) => {
      const config = normalizeTodoWidgetConfig(widget.config)
      return { widget, config, task: config.task }
    }), [instances])
  const activeNotes = notes.filter((note) => !note.task?.done)
  const archivedNotes = notes
    .filter((note) => note.task?.done)
    .sort((a, b) => (b.task?.completedAt ?? 0) - (a.task?.completedAt ?? 0))
  const tasks = collectTodoTasks(instances)
  const now = Date.now()
  const summary = summarizeTodoWeek(tasks, now, weekOffset)
  const overdueCount = activeNotes.filter((note) => note.task && getTodoTaskBucket(note.task, now) === 'overdue').length
  const visibleCount = activeNotes.filter((note) => note.widget.enabled).length

  const createNote = async (blank = false): Promise<void> => {
    const title = sanitizeTodoTitle(draft)
    if (!blank && !title) return
    const task = title
      ? createTodoTask({
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          dueAt: createTodoDueAt(dueChoice),
          priority: highPriority ? 'high' : 'normal',
        })
      : undefined
    const rotations = [-1.8, 1.3, -0.8, 2.1, -1.2]
    await onCreate(createTodoWidgetConfig({
      task,
      color,
      paperStyle,
      rotation: rotations[notes.length % rotations.length],
    }))
    setDraft('')
    setHighPriority(false)
  }

  const updateConfig = async (record: TodoNoteRecord, config: TodoWidgetConfig): Promise<void> => {
    await window.lingyue.widget.updateConfig(record.widget.id, { ...config })
    await onRefresh()
  }

  const setVisible = async (record: TodoNoteRecord, enabled: boolean): Promise<void> => {
    await window.lingyue.widget.update({ ...record.widget, enabled, config: { ...record.config } })
    await onRefresh()
  }

  const complete = async (record: TodoNoteRecord): Promise<void> => {
    if (!record.task || record.task.done) return
    const requestedAt = Date.now()
    await updateConfig(record, {
      ...record.config,
      task: setTodoTaskDone(record.task, true, requestedAt),
      tearRequestedAt: requestedAt,
    })
  }

  const reopen = async (record: TodoNoteRecord): Promise<void> => {
    if (!record.task) return
    const nextConfig: TodoWidgetConfig = {
      ...record.config,
      task: setTodoTaskDone(record.task, false),
      tearRequestedAt: undefined,
    }
    await window.lingyue.widget.update({ ...record.widget, enabled: true, config: { ...nextConfig } })
    await onRefresh()
  }

  const rename = async (record: TodoNoteRecord, value: string): Promise<void> => {
    if (!record.task) return
    const title = sanitizeTodoTitle(value)
    if (!title || title === record.task.title) return
    await updateConfig(record, {
      ...record.config,
      task: { ...record.task, title, category: inferTodoCategory(title), updatedAt: Date.now() },
    })
  }

  const weekRange = getTodoWeekRange(now, weekOffset)
  const maxDayCount = Math.max(1, ...summary.dayCounts)
  const sampleTitles = activeNotes.flatMap((note) => note.task?.title ? [note.task.title] : []).slice(0, 3)
  while (sampleTitles.length < 3) sampleTitles.push(['把桌面整理得轻一点', '完成后，把它撕下来', '散步二十分钟'][sampleTitles.length])

  return (
    <div className="todo-studio">
      <section className="todo-studio__hero">
        <div className="todo-studio__hero-copy">
          <span className="todo-studio__kicker"><Sparkles size={13} /> LINGYUE STICKY STUDIO</span>
          <h2>桌面只留一件事。<br />其余的，在这里安排。</h2>
          <p>每张便利贴都是独立任务：可以任意叠放、直接拖动和缩放。完成时从桌面撕下，记录会自动回到这里。</p>
          <div className="todo-studio__hero-stats">
            <span><strong>{activeNotes.length}</strong> 进行中</span>
            <span><strong>{visibleCount}</strong> 桌面可见</span>
            <span data-alert={overdueCount > 0}><strong>{overdueCount}</strong> 已逾期</span>
          </div>
          <span className="todo-studio__ai"><Bot size={13} /> 也可以对 AI 说：“新增一张明晚交周报的粉色便签”</span>
        </div>
        <div className="todo-studio__preview" aria-label="自由叠放便利贴预览">
          {sampleTitles.map((title, index) => (
            <div key={`${title}-${index}`} data-color={TODO_NOTE_COLORS[index]}>
              <i />
              <span>{index === 0 ? '今天' : TODO_CATEGORY_META[['work', 'health', 'life'][index] as TodoTask['category']].label}</span>
              <strong>{title}</strong>
              <b><Check size={12} /></b>
            </div>
          ))}
        </div>
      </section>

      <section className="todo-studio__composer">
        <div className="todo-studio__composer-main">
          <span>NEW NOTE</span>
          <textarea
            value={draft}
            maxLength={160}
            placeholder="现在最想完成哪一件事？"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void createNote()
            }}
          />
          <small>Ctrl + Enter 直接贴到桌面</small>
        </div>
        <div className="todo-studio__composer-options">
          <label>纸张颜色</label>
          <div className="todo-studio__swatches">
            {TODO_NOTE_COLORS.map((item) => (
              <button key={item} type="button" data-color={item} data-active={color === item} onClick={() => setColor(item)} title={COLOR_LABELS[item]} />
            ))}
          </div>
          <label>固定方式</label>
          <div className="todo-studio__segmented">
            {(['tape', 'pin', 'plain'] as TodoNotePaperStyle[]).map((item) => (
              <button key={item} type="button" data-active={paperStyle === item} onClick={() => setPaperStyle(item)}>
                <Paperclip size={12} /> {PAPER_LABELS[item]}
              </button>
            ))}
          </div>
          <div className="todo-studio__segmented">
            {(['none', 'today', 'tomorrow'] as DueChoice[]).map((item) => (
              <button key={item} type="button" data-active={dueChoice === item} onClick={() => setDueChoice(item)}>
                <Clock3 size={12} /> {item === 'none' ? '无日期' : item === 'today' ? '今天' : '明天'}
              </button>
            ))}
            <button type="button" data-active={highPriority} onClick={() => setHighPriority((value) => !value)}>重要</button>
          </div>
          <div className="todo-studio__composer-actions">
            <button type="button" className="btn" onClick={() => void createNote(true)}>添加空白</button>
            <button type="button" className="btn btn--primary" disabled={!sanitizeTodoTitle(draft)} onClick={() => void createNote()}>
              <Plus size={14} /> 贴到桌面
            </button>
          </div>
        </div>
      </section>

      <nav className="todo-studio__tabs" aria-label="任务便笺视图">
        <button type="button" data-active={tab === 'active'} onClick={() => setTab('active')}>进行中 <span>{activeNotes.length}</span></button>
        <button type="button" data-active={tab === 'week'} onClick={() => setTab('week')}>周复盘</button>
        <button type="button" data-active={tab === 'archive'} onClick={() => setTab('archive')}>已撕下 <span>{archivedNotes.length}</span></button>
      </nav>

      {tab === 'active' && (
        <section className="todo-studio__active">
          {activeNotes.length === 0 ? (
            <EmptyState icon={<Check size={21} />} title="桌面现在很轻" detail="新增一张便利贴，或者让 AI 帮你安排下一件事。" />
          ) : (['overdue', 'today', 'upcoming', 'later', 'undated'] as const).map((bucket) => {
            const bucketNotes = activeNotes.filter((note) => note.task ? getTodoTaskBucket(note.task, now) === bucket : bucket === 'undated')
            if (bucketNotes.length === 0) return null
            return (
              <div className="todo-studio__group" key={bucket}>
                <header><span>{BUCKET_LABELS[bucket]}</span><small>{bucketNotes.length}</small></header>
                <div>
                  {bucketNotes.map((record) => (
                    <NoteRow
                      key={record.widget.id}
                      record={record}
                      onRename={(value) => rename(record, value)}
                      onVisible={(enabled) => setVisible(record, enabled)}
                      onComplete={() => complete(record)}
                      onRemove={() => onRemove(record.widget.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {tab === 'week' && (
        <section className="todo-studio__week">
          <header className="todo-studio__week-nav">
            <button type="button" onClick={() => setWeekOffset((value) => Math.max(-52, value - 1))}><ChevronLeft size={16} /></button>
            <div>
              <strong>{weekOffset === 0 ? '本周复盘' : weekOffset === -1 ? '上周复盘' : '历史周记'}</strong>
              <span>{new Date(weekRange.start).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} — {new Date(weekRange.end).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
            </div>
            <button type="button" disabled={weekOffset >= 0} onClick={() => setWeekOffset((value) => Math.min(0, value + 1))}><ChevronRight size={16} /></button>
          </header>
          <div className="todo-studio__metric-grid">
            <article><span>完成</span><strong>{summary.completed.length}</strong><small>张便利贴被撕下</small></article>
            <article><span>收尾率</span><strong>{summary.completionRate}<i>%</i></strong><small>{summary.plannedCount} 项计划</small></article>
            <article><span>活跃天</span><strong>{summary.activeDays}</strong><small>这一周有行动</small></article>
            <article data-alert={summary.unfinished.length > 0}><span>未收尾</span><strong>{summary.unfinished.length}</strong><small>继续留在桌面</small></article>
          </div>
          <div className="todo-studio__week-body">
            <article className="todo-studio__chart">
              <header><strong>一周节奏</strong><span>{summary.headline}</span></header>
              <div>
                {summary.dayCounts.map((count, index) => (
                  <span key={index}><i style={{ height: `${Math.max(count > 0 ? 16 : 4, count / maxDayCount * 100)}%` }} /><b>{count}</b><small>{['一', '二', '三', '四', '五', '六', '日'][index]}</small></span>
                ))}
              </div>
            </article>
            <article className="todo-studio__carry">
              <header><strong>还留在桌面的事</strong><span>{summary.unfinished.length}</span></header>
              {summary.unfinished.length === 0 ? <p>这一周都收尾了，很干净。</p> : summary.unfinished.slice(0, 6).map((task) => (
                <div key={task.id}><i data-category={task.category} /><span>{task.title}</span><small>{formatTodoDueLabel(task.dueAt)}</small></div>
              ))}
            </article>
          </div>
        </section>
      )}

      {tab === 'archive' && (
        <section className="todo-studio__archive">
          {archivedNotes.length === 0 ? (
            <EmptyState icon={<Archive size={21} />} title="还没有撕下的记录" detail="完成一张桌面便利贴后，它会带着完成时间来到这里。" />
          ) : archivedNotes.map((record) => (
            <article key={record.widget.id} data-color={record.config.color}>
              <span className="todo-studio__archive-check"><Check size={14} /></span>
              <div><strong>{record.task?.title}</strong><small>{record.task?.completedAt ? new Date(record.task.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '已完成'} · {record.task ? TODO_CATEGORY_META[record.task.category].label : ''}</small></div>
              <button type="button" onClick={() => void reopen(record)}><RotateCcw size={13} /> 重新贴回</button>
              <button type="button" aria-label="永久删除" onClick={() => void onRemove(record.widget.id)}><Trash2 size={14} /></button>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

function NoteRow({
  record,
  onRename,
  onVisible,
  onComplete,
  onRemove,
}: {
  record: TodoNoteRecord
  onRename: (value: string) => Promise<void>
  onVisible: (enabled: boolean) => Promise<void>
  onComplete: () => Promise<void>
  onRemove: () => Promise<void>
}) {
  const task = record.task
  return (
    <article className="todo-studio__row" data-color={record.config.color}>
      <button type="button" className="todo-studio__row-check" disabled={!task} onClick={() => void onComplete()} title="完成并撕下"><Check size={14} /></button>
      <div className="todo-studio__row-copy">
        {task ? (
          <input
            defaultValue={task.title}
            aria-label={`编辑 ${task.title}`}
            onBlur={(event) => void onRename(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        ) : <strong>空白便利贴</strong>}
        <span>
          {task && <i data-category={task.category}>{TODO_CATEGORY_META[task.category].label}</i>}
          {task?.dueAt && <time data-overdue={getTodoTaskBucket(task) === 'overdue'}>{formatTodoDueLabel(task.dueAt)}</time>}
          <small>{record.widget.width} × {record.widget.height}</small>
        </span>
      </div>
      <button type="button" onClick={() => void onVisible(!record.widget.enabled)} title={record.widget.enabled ? '从桌面隐藏' : '显示到桌面'}>
        {record.widget.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <button type="button" onClick={() => void onRemove()} title="永久删除"><Trash2 size={15} /></button>
    </article>
  )
}

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="todo-studio__empty"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div>
}
