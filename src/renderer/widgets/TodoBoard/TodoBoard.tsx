import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Clock3 } from 'lucide-react'
import type { TodoTask, TodoWidgetConfig, WidgetInstance } from '@shared/types'
import {
  TODO_CATEGORY_META,
  createTodoTask,
  formatTodoDueLabel,
  getTodoTaskBucket,
  inferTodoCategory,
  normalizeTodoWidgetConfig,
  sanitizeTodoTitle,
  setTodoTaskDone,
} from '@shared/todo'
import './todo-board.css'

const TEAR_DURATION_MS = 780

function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function TodoBoardWidget({ widget }: { widget: WidgetInstance }) {
  const config = useMemo(() => normalizeTodoWidgetConfig(widget.config), [widget.config])
  const [draft, setDraft] = useState(config.task?.title ?? '')
  const [editingText, setEditingText] = useState(false)
  const [tearing, setTearing] = useState(false)
  const editingRef = useRef(editingText)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const tearTimerRef = useRef<number | null>(null)
  const handledTearRef = useRef<number | null>(null)

  editingRef.current = editingText

  useEffect(() => {
    if (!editingRef.current) setDraft(config.task?.title ?? '')
  }, [config.task?.title])

  useEffect(() => {
    if (!editingText) return undefined
    let cancelled = false
    void window.canvasBridge?.setTextInputActive(true).then((ready) => {
      if (!ready || cancelled) return
      window.requestAnimationFrame(() => inputRef.current?.focus())
    })
    return () => {
      cancelled = true
      void window.canvasBridge?.setTextInputActive(false)
    }
  }, [editingText])

  const persistConfig = useCallback((next: TodoWidgetConfig) => {
    void window.canvasBridge?.updateWidgetConfig(widget.id, { ...next })
  }, [widget.id])

  const persistDraft = useCallback(() => {
    const title = sanitizeTodoTitle(draft)
    if (!title) {
      setDraft(config.task?.title ?? '')
      return
    }
    if (title === config.task?.title) return

    const now = Date.now()
    const task: TodoTask = config.task
      ? { ...config.task, title, category: inferTodoCategory(title), updatedAt: now }
      : createTodoTask({ id: createTaskId(), title, now })
    setDraft(title)
    persistConfig({ ...config, task, tearRequestedAt: undefined })
  }, [config, draft, persistConfig])

  useEffect(() => {
    if (!editingText || !sanitizeTodoTitle(draft) || draft === config.task?.title) return undefined
    const timer = window.setTimeout(persistDraft, 520)
    return () => window.clearTimeout(timer)
  }, [config.task?.title, draft, editingText, persistDraft])

  const hideAfterTear = useCallback((nextConfig: TodoWidgetConfig) => {
    if (tearTimerRef.current !== null) window.clearTimeout(tearTimerRef.current)
    tearTimerRef.current = window.setTimeout(() => {
      tearTimerRef.current = null
      void window.canvasBridge?.updateWidget({ ...widget, enabled: false, config: { ...nextConfig } })
    }, TEAR_DURATION_MS)
  }, [widget])

  useEffect(() => {
    const requestedAt = config.tearRequestedAt
    if (!widget.enabled || !config.task?.done || requestedAt === undefined || handledTearRef.current === requestedAt) return
    handledTearRef.current = requestedAt
    setTearing(true)
    hideAfterTear(config)
  }, [config, hideAfterTear, widget.enabled])

  useEffect(() => () => {
    if (tearTimerRef.current !== null) window.clearTimeout(tearTimerRef.current)
  }, [])

  const completeTask = (): void => {
    if (!config.task || config.task.done || tearing) return
    persistDraft()
    const requestedAt = Date.now()
    const nextConfig: TodoWidgetConfig = {
      ...config,
      task: setTodoTaskDone(config.task, true, requestedAt),
      tearRequestedAt: requestedAt,
    }
    handledTearRef.current = requestedAt
    setTearing(true)
    persistConfig(nextConfig)
    hideAfterTear(nextConfig)
  }

  const now = Date.now()
  const overdue = config.task ? getTodoTaskBucket(config.task, now) === 'overdue' : false
  const dueLabel = formatTodoDueLabel(config.task?.dueAt, now)

  useEffect(() => {
    const task = config.task
    if (!task || task.done || !task.remind || !overdue || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const date = new Date()
    const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const notificationKey = `lingyue-todo-reminder:${task.id}:${dateKey}`
    if (localStorage.getItem(notificationKey)) return
    localStorage.setItem(notificationKey, '1')
    new Notification('有一张便利贴还没撕下', { body: `${task.title} 已到期，记得安排一下。` })
  }, [config.task, overdue])

  const style = { '--sticky-rotation': `${config.rotation}deg` } as CSSProperties

  return (
    <section
      className="sticky-note"
      data-color={config.color}
      data-paper-style={config.paperStyle}
      data-tearing={tearing}
      data-empty={!config.task}
      style={style}
      aria-label={config.task ? `便利贴：${config.task.title}` : '空白便利贴'}
    >
      <div className="sticky-note__mount" data-widget-drag-handle aria-hidden>
        {config.paperStyle === 'pin' && <i />}
      </div>

      <div className="sticky-note__paper">
        <div className="sticky-note__grain" aria-hidden />
        <div className="sticky-note__tear-edge" aria-hidden />

        {config.task && (
          <header className="sticky-note__meta">
              <span data-category={config.task.category}>
                <i />
                {TODO_CATEGORY_META[config.task.category].label}
              </span>
              {dueLabel && (
                <time data-overdue={overdue}>
                  <Clock3 size={11} />
                  {overdue ? '已逾期' : dueLabel}
                </time>
              )}
              {config.task.priority === 'high' && <b>重要</b>}
          </header>
        )}

        <div className="sticky-note__body">
          {editingText ? (
            <textarea
              ref={inputRef}
              value={draft}
              maxLength={160}
              placeholder="写点什么…"
              aria-label="便利贴内容"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                persistDraft()
                setEditingText(false)
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  persistDraft()
                  setEditingText(false)
                }
                if (event.key === 'Escape') {
                  setDraft(config.task?.title ?? '')
                  setEditingText(false)
                }
              }}
            />
          ) : (
            <button type="button" className="sticky-note__text" onClick={() => setEditingText(true)}>
              {config.task?.title || <span>写点什么…</span>}
            </button>
          )}
        </div>

        {config.task && (
          <button
            type="button"
            className="sticky-note__complete"
            disabled={tearing}
            onClick={completeTask}
            aria-label={`完成并撕下：${config.task.title}`}
            title="完成并撕下"
          >
            <Check size={16} strokeWidth={2.6} />
          </button>
        )}

        <div
          className="sticky-note__resize"
          data-resize="br"
          data-widget-interactive
          title="拖动调整便利贴大小"
          aria-hidden
        />
      </div>
    </section>
  )
}
