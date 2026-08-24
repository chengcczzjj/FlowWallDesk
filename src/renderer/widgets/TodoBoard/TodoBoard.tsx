import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Bold,
  Check,
  Clock3,
  Ellipsis,
  ImagePlus,
  Italic,
  List,
  Plus,
  Strikethrough,
  Underline,
} from 'lucide-react'
import type {
  TodoNoteColor,
  TodoNoteFontFamily,
  TodoTask,
  TodoTaskCategory,
  TodoTextStyle,
  TodoWidgetConfig,
  WidgetInstance,
} from '@shared/types'
import { DEFAULT_WIDGET_SIZE_BY_TYPE } from '@shared/desktop-scene'
import {
  TODO_CATEGORY_META,
  TODO_NOTE_COLORS,
  createTodoTask,
  formatTodoDueLabel,
  getTodoTaskBucket,
  inferTodoCategory,
  normalizeTodoWidgetConfig,
  sanitizeTodoTitle,
  setTodoTaskDone,
} from '@shared/todo'
import './todo-board.css'

const TEAR_DURATION_MS = 540
const TODO_CATEGORIES: TodoTaskCategory[] = ['work', 'study', 'life', 'health', 'other']
const TODO_FORMATS = ['bold', 'italic', 'underline', 'strike', 'list'] as const
type TodoFormat = typeof TODO_FORMATS[number]

const TODO_COLOR_LABELS: Record<TodoNoteColor, string> = {
  butter: '黄色',
  rose: '粉色',
  mint: '绿色',
  sky: '蓝色',
  lilac: '灰紫色',
}

const TODO_FONT_FAMILY_CSS: Record<TodoNoteFontFamily, string> = {
  system: 'system-ui, "Segoe UI", "Microsoft YaHei UI", sans-serif',
  serif: 'Georgia, "Times New Roman", "Microsoft YaHei UI", serif',
  mono: '"Cascadia Code", Consolas, "Microsoft YaHei UI", monospace',
  handwritten: '"Comic Sans MS", "Microsoft YaHei UI", cursive',
}

const TODO_FONT_FAMILY_LABELS: Record<TodoNoteFontFamily, string> = {
  system: '系统',
  serif: '衬线',
  mono: '等宽',
  handwritten: '手写',
}

const FORMAT_COMMANDS: Record<TodoFormat, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
  list: 'insertUnorderedList',
}

function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createNoteId(): string {
  return `todo-board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isDataImage(value: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value)
}

/** Keep contenteditable output local and limited to the formatting toolbar's tags. */
function sanitizeEditorHtml(value: string): string {
  if (typeof document === 'undefined') return escapeHtml(value)
  const template = document.createElement('template')
  template.innerHTML = value.slice(0, 512 * 1024)
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'IMG'])
  template.content.querySelectorAll('*').forEach((element) => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      return
    }
    const isImage = element.tagName === 'IMG'
    Array.from(element.attributes).forEach((attribute) => {
      if (isImage && attribute.name === 'src' && isDataImage(attribute.value)) return
      if (isImage && attribute.name === 'alt') return
      element.removeAttribute(attribute.name)
    })
    if (isImage && !isDataImage(element.getAttribute('src') ?? '')) element.remove()
  })
  return template.innerHTML
}

function getPlainTextFromHtml(value: string): string {
  if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, ' ')
  const container = document.createElement('div')
  container.innerHTML = sanitizeEditorHtml(value)
  return container.textContent ?? ''
}

function getInitialEditorHtml(config: TodoWidgetConfig): string {
  const bodyHtml = typeof config.bodyHtml === 'string' ? sanitizeEditorHtml(config.bodyHtml) : ''
  return bodyHtml || escapeHtml(config.task?.title ?? '')
}

async function readImageAsDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024) return null
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('image-read-failed'))
    reader.readAsDataURL(file)
  })
  if (!raw || raw.length <= 320 * 1024) return raw

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return raw
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function TodoBoardWidget({ widget }: { widget: WidgetInstance }) {
  const config = useMemo(() => normalizeTodoWidgetConfig(widget.config), [widget.config])
  const configRef = useRef(config)
  configRef.current = config
  const [editingText, setEditingText] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tearing, setTearing] = useState(false)
  const [activeFormats, setActiveFormats] = useState<Record<TodoFormat, boolean>>({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    list: false,
  })
  const editorRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const tearTimerRef = useRef<number | null>(null)
  const editorSaveTimerRef = useRef<number | null>(null)
  const handledTearRef = useRef<number | null>(null)

  const persistConfig = useCallback((patch: Partial<TodoWidgetConfig>) => {
    void window.canvasBridge?.updateWidgetConfig(widget.id, { ...patch })
  }, [widget.id])

  const persistEditorContent = useCallback((html: string): void => {
    const bodyHtml = sanitizeEditorHtml(html)
    const title = sanitizeTodoTitle(getPlainTextFromHtml(bodyHtml))
    if (!title) return
    const now = Date.now()
    const task: TodoTask = config.task
      ? { ...config.task, title, category: inferTodoCategory(title), updatedAt: now }
      : createTodoTask({ id: createTaskId(), title, now })
    if (title === config.task?.title && bodyHtml === config.bodyHtml) return
    persistConfig({ ...config, task, bodyHtml, tearRequestedAt: undefined })
  }, [config, persistConfig])

  const queueEditorSave = useCallback((html: string): void => {
    if (editorSaveTimerRef.current !== null) window.clearTimeout(editorSaveTimerRef.current)
    editorSaveTimerRef.current = window.setTimeout(() => {
      editorSaveTimerRef.current = null
      persistEditorContent(html)
    }, 520)
  }, [persistEditorContent])

  const finishEditing = useCallback((): void => {
    if (editorSaveTimerRef.current !== null) {
      window.clearTimeout(editorSaveTimerRef.current)
      editorSaveTimerRef.current = null
    }
    if (editorRef.current) persistEditorContent(editorRef.current.innerHTML)
    setEditingText(false)
  }, [persistEditorContent])

  useEffect(() => {
    if (!editingText) return undefined
    let cancelled = false
    const activation = window.canvasBridge?.setTextInputActive(true)
    void activation?.then((ready) => {
      if (!ready || cancelled) return
      if (editorRef.current) editorRef.current.innerHTML = getInitialEditorHtml(configRef.current)
      window.requestAnimationFrame(() => editorRef.current?.focus())
    })
    return () => {
      cancelled = true
      void window.canvasBridge?.setTextInputActive(false)
    }
  }, [editingText])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!settingsRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        setSettingsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [settingsOpen])

  const refreshActiveFormats = useCallback(() => {
    if (!editingText) return
    setActiveFormats((current) => {
      const next = { ...current }
      TODO_FORMATS.forEach((format) => {
        try {
          next[format] = document.queryCommandState(FORMAT_COMMANDS[format])
        } catch {
          next[format] = false
        }
      })
      return next
    })
  }, [editingText])

  useEffect(() => {
    if (!editingText) return undefined
    document.addEventListener('selectionchange', refreshActiveFormats)
    return () => document.removeEventListener('selectionchange', refreshActiveFormats)
  }, [editingText, refreshActiveFormats])

  useEffect(() => () => {
    if (tearTimerRef.current !== null) window.clearTimeout(tearTimerRef.current)
    if (editorSaveTimerRef.current !== null) window.clearTimeout(editorSaveTimerRef.current)
  }, [])

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

  const completeTask = (): void => {
    if (!config.task || config.task.done || tearing) return
    setSettingsOpen(false)
    const html = editorRef.current?.innerHTML ?? config.bodyHtml ?? escapeHtml(config.task.title)
    const bodyHtml = sanitizeEditorHtml(html)
    const title = sanitizeTodoTitle(getPlainTextFromHtml(bodyHtml)) || config.task.title
    const now = Date.now()
    const task = { ...config.task, title, category: inferTodoCategory(title), updatedAt: now }
    const requestedAt = now
    const nextConfig: TodoWidgetConfig = {
      ...config,
      task: setTodoTaskDone(task, true, requestedAt),
      bodyHtml,
      tearRequestedAt: requestedAt,
    }
    if (editorSaveTimerRef.current !== null) window.clearTimeout(editorSaveTimerRef.current)
    handledTearRef.current = requestedAt
    setEditingText(false)
    setTearing(true)
    persistConfig(nextConfig)
    hideAfterTear(nextConfig)
  }

  const addNote = useCallback(() => {
    const size = DEFAULT_WIDGET_SIZE_BY_TYPE['todo-board']
    void window.canvasBridge?.addWidget({
      id: createNoteId(),
      type: 'todo-board',
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      enabled: true,
      config: { version: 2, color: 'butter', paperStyle: 'tape', rotation: -1.4 },
    })
  }, [])

  const changeColor = (color: TodoNoteColor): void => {
    if (color !== config.color) persistConfig({ color })
  }

  const changeCategory = (category: TodoTaskCategory): void => {
    if (!config.task || category === config.task.category) return
    persistConfig({ task: { ...config.task, category, updatedAt: Date.now() } })
  }

  const updateTextStyle = (patch: Partial<TodoTextStyle>): void => {
    persistConfig({ textStyle: { ...config.textStyle, ...patch } })
  }

  const syncEditorContent = (): void => {
    if (!editorRef.current) return
    queueEditorSave(editorRef.current.innerHTML)
    refreshActiveFormats()
  }

  const runFormat = (format: TodoFormat): void => {
    if (!editorRef.current) return
    editorRef.current.focus()
    try {
      document.execCommand(FORMAT_COMMANDS[format], false)
    } catch {
      // Chromium still supports these editing commands in the desktop build.
    }
    syncEditorContent()
  }

  const insertImage = async (file: File): Promise<void> => {
    if (!editorRef.current) return
    try {
      const dataUrl = await readImageAsDataUrl(file)
      if (!dataUrl) return
      editorRef.current.focus()
      document.execCommand('insertImage', false, dataUrl)
      syncEditorContent()
    } catch {
      window.canvasBridge?.logDiagnostic('todo-image-insert-failed', { name: file.name, type: file.type })
    }
  }

  const now = Date.now()
  const overdue = config.task ? getTodoTaskBucket(config.task, now) === 'overdue' : false
  const dueLabel = formatTodoDueLabel(config.task?.dueAt, now)
  const displayHtml = useMemo(() => getInitialEditorHtml(config), [config])
  const style = {
    '--sticky-rotation': `${config.rotation}deg`,
    '--sticky-font-size': `${config.textStyle.fontSize}px`,
    '--sticky-font-family': TODO_FONT_FAMILY_CSS[config.textStyle.fontFamily],
    '--sticky-font-weight': config.textStyle.bold ? '700' : '400',
    '--sticky-font-style': config.textStyle.italic ? 'italic' : 'normal',
    '--sticky-text-decoration': [config.textStyle.underline ? 'underline' : '', config.textStyle.strike ? 'line-through' : '']
      .filter(Boolean)
      .join(' ') || 'none',
  } as CSSProperties

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

  return (
    <section
      className="sticky-note"
      data-color={config.color}
      data-paper-style={config.paperStyle}
      data-tearing={tearing}
      data-empty={!config.task}
      data-editing={editingText}
      style={style}
      aria-label={config.task ? `便利贴：${config.task.title}` : '空白便利贴'}
    >
      <div className="sticky-note__mount" data-widget-drag-handle aria-hidden>
        {config.paperStyle === 'pin' && <i />}
      </div>

      <div className="sticky-note__paper">
        <div className="sticky-note__grain" aria-hidden />
        <div className="sticky-note__tear-edge" aria-hidden />

        <header className="sticky-note__topbar">
          <button
            type="button"
            className="sticky-note__add-button"
            data-widget-interactive
            aria-label="新增便利贴"
            title="新增便利贴"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={addNote}
          >
            <Plus size={18} strokeWidth={1.8} />
          </button>
          <div className="sticky-note__drag-zone" data-widget-drag-handle>
            {config.task ? (
              <span className="sticky-note__category" data-category={config.task.category}>
                <i />
                {TODO_CATEGORY_META[config.task.category].label}
              </span>
            ) : (
              <span className="sticky-note__label">便笺</span>
            )}
            {config.task && (
              <>
                {dueLabel && (
                  <time data-overdue={overdue}>
                    <Clock3 size={10} />
                    {overdue ? '已逾期' : dueLabel}
                  </time>
                )}
                {config.task.priority === 'high' && <b>重要</b>}
              </>
            )}
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="sticky-note__menu-button"
            data-widget-interactive
            aria-label="设置便笺颜色和分类"
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Ellipsis size={15} />
          </button>
        </header>

        {settingsOpen && (
          <div ref={settingsRef} className="sticky-note__settings" data-widget-interactive role="dialog" aria-label="便笺设置">
            <section>
              <small>便笺颜色</small>
              <div className="sticky-note__colors">
                {TODO_NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    data-color={color}
                    data-selected={config.color === color}
                    aria-label={`切换为${TODO_COLOR_LABELS[color]}`}
                    aria-pressed={config.color === color}
                    onClick={() => changeColor(color)}
                  />
                ))}
              </div>
            </section>
            <section>
              <small>分类</small>
              {config.task ? (
                <div className="sticky-note__categories">
                  {TODO_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      data-category={category}
                      data-selected={config.task?.category === category}
                      aria-label={`分类为${TODO_CATEGORY_META[category].label}`}
                      aria-pressed={config.task?.category === category}
                      onClick={() => changeCategory(category)}
                    >
                      <i />
                      {TODO_CATEGORY_META[category].label}
                    </button>
                  ))}
                </div>
              ) : (
                <p>写下内容后即可分类</p>
              )}
            </section>
          </div>
        )}

        <div className="sticky-note__body">
          {editingText ? (
            <div
              ref={editorRef}
              className="sticky-note__text sticky-note__editor"
              contentEditable
              suppressContentEditableWarning
              data-widget-interactive
              data-placeholder="写点什么…"
              role="textbox"
              aria-label="便利贴内容"
              aria-multiline="true"
              onInput={syncEditorContent}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget as Node | null
                if (nextTarget && toolbarRef.current?.contains(nextTarget)) return
                finishEditing()
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  finishEditing()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  if (editorSaveTimerRef.current !== null) window.clearTimeout(editorSaveTimerRef.current)
                  setEditingText(false)
                }
              }}
            />
          ) : (
            <div
              className="sticky-note__text"
              data-widget-interactive
              role="button"
              tabIndex={0}
              aria-label="编辑便利贴内容"
              dangerouslySetInnerHTML={{ __html: displayHtml || '<span>写点什么…</span>' }}
              onClick={() => setEditingText(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setEditingText(true)
              }}
            />
          )}
        </div>

        {editingText && (
          <div ref={toolbarRef} className="sticky-note__formatbar" data-widget-interactive role="toolbar" aria-label="文字格式">
            <button type="button" data-active={activeFormats.bold} aria-label="粗体" aria-pressed={activeFormats.bold} title="粗体" onPointerDown={(event) => event.preventDefault()} onClick={() => runFormat('bold')}><Bold size={18} /></button>
            <button type="button" data-active={activeFormats.italic} aria-label="斜体" aria-pressed={activeFormats.italic} title="斜体" onPointerDown={(event) => event.preventDefault()} onClick={() => runFormat('italic')}><Italic size={18} /></button>
            <button type="button" data-active={activeFormats.underline} aria-label="下划线" aria-pressed={activeFormats.underline} title="下划线" onPointerDown={(event) => event.preventDefault()} onClick={() => runFormat('underline')}><Underline size={18} /></button>
            <button type="button" data-active={activeFormats.strike} aria-label="删除线" aria-pressed={activeFormats.strike} title="删除线" onPointerDown={(event) => event.preventDefault()} onClick={() => runFormat('strike')}><Strikethrough size={18} /></button>
            <button type="button" data-active={activeFormats.list} aria-label="项目列表" aria-pressed={activeFormats.list} title="项目列表" onPointerDown={(event) => event.preventDefault()} onClick={() => runFormat('list')}><List size={19} /></button>
            <button type="button" aria-label="插入图片" title="插入图片" onPointerDown={(event) => event.preventDefault()} onClick={() => imageInputRef.current?.click()}><ImagePlus size={19} /></button>
            <span className="sticky-note__format-divider" aria-hidden />
            <select
              className="sticky-note__font-family"
              aria-label="字体"
              title="字体"
              value={config.textStyle.fontFamily}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => updateTextStyle({ fontFamily: event.target.value as TodoNoteFontFamily })}
            >
              {(Object.keys(TODO_FONT_FAMILY_LABELS) as TodoNoteFontFamily[]).map((family) => (
                <option key={family} value={family}>{TODO_FONT_FAMILY_LABELS[family]}</option>
              ))}
            </select>
            <button type="button" className="sticky-note__font-size" aria-label="减小字号" title="减小字号" onPointerDown={(event) => event.preventDefault()} onClick={() => updateTextStyle({ fontSize: Math.max(12, config.textStyle.fontSize - 1) })}>A−</button>
            <button type="button" className="sticky-note__font-size" aria-label="增大字号" title="增大字号" onPointerDown={(event) => event.preventDefault()} onClick={() => updateTextStyle({ fontSize: Math.min(36, config.textStyle.fontSize + 1) })}>A＋</button>
            <input
              ref={imageInputRef}
              className="sticky-note__image-input"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void insertImage(file)
              }}
            />
          </div>
        )}

        {config.task && !editingText && (
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
