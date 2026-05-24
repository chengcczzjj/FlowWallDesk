import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetInstance } from '@shared/types'
import { renderWidget, hasFloatingToolbar, isFloatingType, isStretchFillType } from '../widgets'
import { FloatingToolbar } from '../widgets/FloatingToolbar'
import { WallpaperFrameCtx, WidgetPosCtx } from './contexts'

const GRID = 16
const EDGE_PADDING = 24
const BOTTOM_EDGE_PADDING = EDGE_PADDING
const MIN_SIZE = 80
const HANDLE_SIZE = 14
const ICON_CELL_WIDTH = 78
const ICON_CELL_HEIGHT = 88
const ICON_CELL_HEIGHT_COMPACT = 64
const ICON_GAP_X = 12
const ICON_GAP_Y = 16
const ICON_GAP_Y_COMPACT = 8
const ICON_PADDING = 22
const LONG_PRESS_WIDGET_DRAG_MS = 1000
const LONG_PRESS_WIDGET_CANCEL_PX = 8
const ICON_STORAGE_SCALE_MIN = 0.65
const ICON_STORAGE_SCALE_MAX = 1.8
const ICON_STORAGE_TITLE_HEIGHT = 38

interface ConfigUpdateOptions {
  applyToAllIconStorage?: boolean
}

/** 碰撞间距 — 组件之间最小间隔 */
const COLLISION_GAP = GRID

/**
 * 获取组件的 DOM 实际矩形。
 * 始终从 DOM 读取，确保缩放后的视觉尺寸与碰撞矩形一致。
 */
function getDomRect(id: string, fallback: { x: number; y: number; w: number; h: number }) {
  const el = document.querySelector(`[data-widget="${id}"]`) as HTMLElement | null
  return {
    x: fallback.x,
    y: fallback.y,
    w: el?.offsetWidth || fallback.w || 160,
    h: el?.offsetHeight || fallback.h || 160,
  }
}

function isIconStorageType(type: string): boolean {
  return ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive'].includes(type)
}

function readStorageChromeStyle(config?: Record<string, unknown>): 'plain' | 'titled' {
  return config?.storageStyle === 'titled' ? 'titled' : 'plain'
}

function hasConfigKey(config: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, key)
}

function applyConfigUpdate(widget: WidgetInstance, newConfig: Record<string, unknown>): WidgetInstance {
  const nextConfig = { ...(widget.config ?? {}), ...newConfig }
  if (!isIconStorageType(widget.type) || !hasConfigKey(newConfig, 'storageStyle')) {
    return { ...widget, config: nextConfig }
  }

  const currentStyle = readStorageChromeStyle(widget.config)
  const nextStyle = readStorageChromeStyle(nextConfig)
  if (currentStyle === nextStyle) return { ...widget, config: nextConfig }

  const heightDelta = nextStyle === 'titled' ? ICON_STORAGE_TITLE_HEIGHT : -ICON_STORAGE_TITLE_HEIGHT
  return {
    ...widget,
    height: Math.max(MIN_SIZE, widget.height + heightDelta),
    config: { ...nextConfig, storageTitleExpanded: nextStyle === 'titled' },
  }
}

function needsWidgetUpdate(prev: WidgetInstance, next: WidgetInstance): boolean {
  return prev.x !== next.x || prev.y !== next.y || prev.width !== next.width || prev.height !== next.height
}

function isDesktopIconWidgetType(type: string): boolean {
  return ['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive', 'desktop-icons-dock'].includes(type)
}

function snapIconStorageWidth(width: number, scale: number, hideLabels = false): number {
  const columns = getIconStorageColumnCount(width, scale, hideLabels)
  const metrics = getIconStorageMetrics(scale, hideLabels)
  return metrics.padding * 2 + columns * metrics.cellWidth + (columns - 1) * metrics.gapX
}

function getIconStorageColumnCount(width: number, scale: number, hideLabels = false): number {
  const metrics = getIconStorageMetrics(scale, hideLabels)
  return Math.max(
    1,
    Math.round((Math.max(width, metrics.minWidth) - metrics.padding * 2 + metrics.gapX) / (metrics.cellWidth + metrics.gapX))
  )
}

function snapIconStorageHeight(height: number, scale: number, hideLabels = false): number {
  const rows = getIconStorageRowCount(height, scale, hideLabels)
  const metrics = getIconStorageMetrics(scale, hideLabels)
  return metrics.padding * 2 + rows * metrics.cellHeight + (rows - 1) * metrics.gapY
}

function getIconStorageRowCount(height: number, scale: number, hideLabels = false): number {
  const metrics = getIconStorageMetrics(scale, hideLabels)
  return Math.max(
    1,
    Math.round((Math.max(height, metrics.minHeight) - metrics.padding * 2 + metrics.gapY) / (metrics.cellHeight + metrics.gapY))
  )
}

function getAdaptiveManualColumns(
  widget: WidgetInstance,
  edge: string,
  width: number,
  height: number,
  originWidth: number,
  originHeight: number,
  scale: number,
  hideLabels: boolean
): number {
  const columnsFromWidth = getIconStorageColumnCount(width, scale, hideLabels)
  const hasHorizontalEdge = edge.includes('l') || edge.includes('r')
  const hasVerticalEdge = edge.includes('t') || edge.includes('b')
  if (hasHorizontalEdge && !hasVerticalEdge) return columnsFromWidth

  const rowsFromHeight = getIconStorageRowCount(height, scale, hideLabels)
  const items = Array.isArray(widget.config?.items) ? widget.config.items.length : 0
  const layoutCount = Math.max(4, items)
  const columnsFromHeight = Math.max(1, Math.ceil(layoutCount / rowsFromHeight))
  if (hasVerticalEdge && !hasHorizontalEdge) return columnsFromHeight

  const columnDelta = Math.abs(columnsFromWidth - getIconStorageColumnCount(originWidth, scale, hideLabels))
  const rowDelta = Math.abs(rowsFromHeight - getIconStorageRowCount(originHeight, scale, hideLabels))
  return rowDelta > columnDelta ? columnsFromHeight : columnsFromWidth
}

function readIconStorageScale(config?: Record<string, unknown>): number {
  const value = config?.iconScale
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return clampNumber(value, ICON_STORAGE_SCALE_MIN, ICON_STORAGE_SCALE_MAX)
}

function readIconStorageHideLabels(config?: Record<string, unknown>): boolean {
  return config?.storageHideLabels === true
}

function getIconStorageMetrics(scale: number, hideLabels = false): {
  cellWidth: number
  cellHeight: number
  gapX: number
  gapY: number
  padding: number
  minWidth: number
  minHeight: number
} {
  const safeScale = clampNumber(scale, ICON_STORAGE_SCALE_MIN, ICON_STORAGE_SCALE_MAX)
  const cellWidth = scaledMetric(ICON_CELL_WIDTH, safeScale)
  const cellHeight = scaledMetric(hideLabels ? ICON_CELL_HEIGHT_COMPACT : ICON_CELL_HEIGHT, safeScale)
  const gapX = scaledMetric(ICON_GAP_X, safeScale)
  const gapY = scaledMetric(hideLabels ? ICON_GAP_Y_COMPACT : ICON_GAP_Y, safeScale)
  const padding = Math.max(12, scaledMetric(ICON_PADDING, safeScale))
  return {
    cellWidth,
    cellHeight,
    gapX,
    gapY,
    padding,
    minWidth: padding * 2 + cellWidth,
    minHeight: padding * 2 + cellHeight,
  }
}

function scaledMetric(value: number, scale: number): number {
  return Math.max(1, Math.round(value * scale))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isCornerResizeEdge(edge: string): boolean {
  return edge.length === 2
}

function getCenteredRect(
  centerX: number,
  centerY: number,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    w: width,
    h: height,
  }
}

function getIconStorageCenteredResize(
  widget: WidgetInstance,
  edge: string,
  dx: number,
  dy: number,
  origin: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number; iconScale?: number } {
  const centerX = origin.x + origin.w / 2
  const centerY = origin.y + origin.h / 2
  const currentScale = readIconStorageScale(widget.config)
  const hideLabels = readIconStorageHideLabels(widget.config)

  if (isCornerResizeEdge(edge)) {
    const outwardX = edge.includes('r') ? dx : -dx
    const outwardY = edge.includes('b') ? dy : -dy
    const widthFactor = (origin.w + outwardX * 2) / Math.max(1, origin.w)
    const heightFactor = (origin.h + outwardY * 2) / Math.max(1, origin.h)
    const rawFactor = Math.max(widthFactor, heightFactor)
    const factor = clampNumber(rawFactor, ICON_STORAGE_SCALE_MIN / currentScale, ICON_STORAGE_SCALE_MAX / currentScale)
    const nextScale = clampNumber(currentScale * factor, ICON_STORAGE_SCALE_MIN, ICON_STORAGE_SCALE_MAX)
    const nextWidth = Math.max(MIN_SIZE, Math.round(origin.w * factor))
    const nextHeight = Math.max(MIN_SIZE, Math.round(origin.h * factor))
    return { ...getCenteredRect(centerX, centerY, nextWidth, nextHeight), iconScale: Number(nextScale.toFixed(3)) }
  }

  let nextWidth = origin.w
  let nextHeight = origin.h
  if (edge.includes('l') || edge.includes('r')) {
    const outwardX = edge.includes('r') ? dx : -dx
    const rawWidth = Math.max(MIN_SIZE, origin.w + outwardX * 2)
    nextWidth =
      widget.type === 'desktop-icons-box' || widget.type === 'desktop-icons-adaptive'
        ? snapIconStorageWidth(rawWidth, currentScale, hideLabels)
        : Math.max(MIN_SIZE, Math.round(rawWidth / GRID) * GRID)
  }
  if (edge.includes('t') || edge.includes('b')) {
    const outwardY = edge.includes('b') ? dy : -dy
    const rawHeight = Math.max(MIN_SIZE, origin.h + outwardY * 2)
    nextHeight =
      widget.type === 'desktop-icons-horizontal' || widget.type === 'desktop-icons-adaptive'
        ? snapIconStorageHeight(rawHeight, currentScale, hideLabels)
        : Math.max(MIN_SIZE, Math.round(rawHeight / GRID) * GRID)
  }

  return getCenteredRect(centerX, centerY, nextWidth, nextHeight)
}

function getIconStorageResizeConfig(
  widget: WidgetInstance,
  edge: string,
  width: number,
  height: number,
  originWidth: number,
  originHeight: number,
  nextIconScale?: number
): Record<string, unknown> | undefined {
  if (!isIconStorageType(widget.type)) return widget.config
  const nextConfig: Record<string, unknown> = { ...(widget.config ?? {}) }
  const scale = nextIconScale ?? readIconStorageScale(widget.config)
  const hideLabels = readIconStorageHideLabels(widget.config)
  if (nextIconScale !== undefined) nextConfig.iconScale = nextIconScale
  if (widget.type === 'desktop-icons-adaptive' && !isCornerResizeEdge(edge)) {
    nextConfig.adaptiveManualColumns = getAdaptiveManualColumns(widget, edge, width, height, originWidth, originHeight, scale, hideLabels)
  }
  return nextConfig
}

/**
 * 碰撞检测 + 吸附位置计算。
 *
 * 算法（仿 macOS）：
 * 1. 根据两组件中心向量决定推开方向（稳定，不受重叠深度影响）
 * 2. 推开距离固定 = COLLISION_GAP
 * 3. 被推组件在推开方向的垂直轴上对齐拖拽组件的边缘
 *    - 水平推 → top 对齐
 *    - 垂直推 → left 对齐
 *
 * 只推被覆盖的组件，拖拽组件保持原位。
 */
function calcSnapTarget(
  moved: { x: number; y: number; w: number; h: number },
  other: { x: number; y: number; w: number; h: number }
): { x: number; y: number } | null {
  // 判断是否重叠
  if (
    moved.x >= other.x + other.w ||
    moved.x + moved.w <= other.x ||
    moved.y >= other.y + other.h ||
    moved.y + moved.h <= other.y
  )
    return null

  // 中心向量决定方向（稳定：只取决于相对位置，不取决于重叠深度）
  const mCx = moved.x + moved.w / 2
  const mCy = moved.y + moved.h / 2
  const oCx = other.x + other.w / 2
  const oCy = other.y + other.h / 2
  const dx = oCx - mCx
  const dy = oCy - mCy

  let nx: number, ny: number

  if (Math.abs(dx) >= Math.abs(dy)) {
    // 水平推开
    nx =
      dx >= 0
        ? moved.x + moved.w + COLLISION_GAP // 推到右侧
        : moved.x - other.w - COLLISION_GAP // 推到左侧
    ny = moved.y // top 对齐
  } else {
    // 垂直推开
    nx = moved.x // left 对齐
    ny =
      dy >= 0
        ? moved.y + moved.h + COLLISION_GAP // 推到下方
        : moved.y - other.h - COLLISION_GAP // 推到上方
  }

  // 吸附到网格
  nx = Math.round(nx / GRID) * GRID
  ny = Math.round(ny / GRID) * GRID
  // 限制范围
  nx = Math.max(EDGE_PADDING, Math.min(nx, window.innerWidth - EDGE_PADDING - other.w))
  ny = Math.max(EDGE_PADDING, Math.min(ny, window.innerHeight - BOTTOM_EDGE_PADDING - other.h))

  return { x: nx, y: ny }
}

/**
 * 桌面组件画布：单个全屏透明窗口，所有桌面组件渲染在此。
 *
 * 编辑模式：右键 → 原生菜单 → 全局编辑，点击空白退出。
 * 选中组件后显示设置工具栏。
 */
export function Canvas() {
  const [widgets, setWidgets] = useState<WidgetInstance[]>([])
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [snapPreviews, setSnapPreviews] = useState<Array<{ id: string; x: number; y: number; w: number; h: number }>>(
    []
  )

  useEffect(() => {
    window.canvasBridge?.getWidgets().then((list) => setWidgets(list))
    const offSync = window.canvasBridge?.onSync((list) => setWidgets(list))
    const offFrame = window.canvasBridge?.onFrame((data) => setFrame(data))
    return () => {
      offSync?.()
      offFrame?.()
    }
  }, [])

  useEffect(() => {
    window.canvasBridge?.setEditMode(editing)
    if (!editing) {
      setSelectedId(null)
      setSnapPreviews([])
    }
  }, [editing])

  const onBgClick = useCallback(() => {
    if (editing) {
      if (selectedId) {
        setSelectedId(null)
      } else {
        setEditing(false)
      }
    }
  }, [editing, selectedId])

  const onBgContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editing) return
      event.preventDefault()
      onBgClick()
    },
    [editing, onBgClick]
  )

  const updateWidgetConfig = useCallback((id: string, newConfig: Record<string, unknown>, options?: ConfigUpdateOptions) => {
    setWidgets((prev) => {
      const source = prev.find((w) => w.id === id)
      const applyToAll = Boolean(options?.applyToAllIconStorage && source && isIconStorageType(source.type))
      const updates: Array<{ prevWidget: WidgetInstance; nextWidget: WidgetInstance }> = []
      const updated = prev.map((w) => {
        const shouldUpdate = applyToAll ? isIconStorageType(w.type) : w.id === id
        if (!shouldUpdate) return w
        const nextWidget = applyConfigUpdate(w, newConfig)
        updates.push({ prevWidget: w, nextWidget })
        return nextWidget
      })

      for (const { prevWidget, nextWidget } of updates) {
        if (needsWidgetUpdate(prevWidget, nextWidget)) {
          window.canvasBridge?.updateWidget(nextWidget)
        } else {
          window.canvasBridge?.updateWidgetConfig(nextWidget.id, newConfig)
        }
      }
      return updated
    })
  }, [])

  /** 拖拽过程中实时计算吸附预览（每帧调用） */
  const onDragPreview = useCallback((movedId: string, movedRect: { x: number; y: number; w: number; h: number }) => {
    const moved = getDomRect(movedId, movedRect)
    const targets: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
    for (const w of widgetsRef.current) {
      if (w.id === movedId || !w.enabled) continue
      const other = getDomRect(w.id, { x: w.x, y: w.y, w: w.width, h: w.height })
      const snap = calcSnapTarget(moved, other)
      if (snap) targets.push({ id: w.id, x: snap.x, y: snap.y, w: other.w, h: other.h })
    }
    setSnapPreviews(targets)
  }, [])

  /** 拖拽结束：先提交拖拽组件位置，再应用碰撞并清除预览 */
  const resolveCollisions = useCallback(
    (movedId: string, movedRect: { x: number; y: number; w: number; h: number }) => {
      const moved = getDomRect(movedId, movedRect)
      const targets: Array<{ id: string; x: number; y: number }> = []
      for (const w of widgetsRef.current) {
        if (w.id === movedId || !w.enabled) continue
        const other = getDomRect(w.id, { x: w.x, y: w.y, w: w.width, h: w.height })
        const snap = calcSnapTarget(moved, other)
        if (snap) targets.push({ id: w.id, x: snap.x, y: snap.y })
      }
      setSnapPreviews([])
      if (targets.length === 0) return
      setWidgets((prev) => {
        const updated = prev.map((w) => {
          // 同步拖拽组件的位置到 state（避免 sync 回调前闪回旧位置）
          if (w.id === movedId) return { ...w, x: movedRect.x, y: movedRect.y }
          const t = targets.find((t) => t.id === w.id)
          if (t) {
            const nw = { ...w, x: t.x, y: t.y }
            window.canvasBridge?.updateWidget(nw)
            return nw
          }
          return w
        })
        return updated
      })
    },
    []
  )

  return (
    <WallpaperFrameCtx.Provider value={frame}>
      <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={onBgClick} onContextMenu={onBgContextMenu}>
        {widgets
          .filter((w) => w.enabled)
          .map((w) => (
            <DraggableWidget
              key={w.id}
              widget={w}
              editing={editing}
              selected={selectedId === w.id}
              onSelect={() => {
                if (editing) setSelectedId(w.id)
              }}
              onEnterEdit={() => setEditing(true)}
              onUpdateConfig={(cfg, options) => updateWidgetConfig(w.id, cfg, options)}
              onDelete={async () => {
                await window.canvasBridge?.removeWidget(w.id)
                if (!editing) window.canvasBridge?.setIgnoreMouse(true)
              }}
              onResolveCollisions={resolveCollisions}
              onDragPreview={onDragPreview}
            />
          ))}
        {/* 吸附预览虚线框 */}
        {snapPreviews.map((p) => (
          <div
            key={`snap-${p.id}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.w,
              height: p.h,
              border: '2px dashed rgba(59,130,246,0.5)',
              borderRadius: 16,
              pointerEvents: 'none',
              zIndex: 999,
              transition: 'left 0.15s ease, top 0.15s ease',
            }}
          />
        ))}
      </div>
    </WallpaperFrameCtx.Provider>
  )
}

function DraggableWidget({
  widget,
  editing,
  selected,
  onSelect,
  onEnterEdit,
  onUpdateConfig,
  onDelete,
  onResolveCollisions,
  onDragPreview,
}: {
  widget: WidgetInstance
  editing: boolean
  selected: boolean
  onSelect: () => void
  onEnterEdit: () => void
  onUpdateConfig: (config: Record<string, unknown>, options?: ConfigUpdateOptions) => void
  onDelete: () => void
  onResolveCollisions: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
  onDragPreview: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const interactivePointerRef = useRef<number | null>(null)
  const longPressDragRef = useRef<{
    startX: number
    startY: number
    pointerId: number
    timer: number
  } | null>(null)
  const [pos, setPos] = useState({ x: widget.x, y: widget.y })
  const posRef = useRef(pos)
  const [size, setSize] = useState({ w: widget.width, h: widget.height })
  const sizeRef = useRef(size)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [pendingIconScale, setPendingIconScale] = useState<number | null>(null)
  const resizeRef = useRef<{
    startX: number
    startY: number
    origW: number
    origH: number
    origX: number
    origY: number
    edge: string
    nextIconScale?: number
  } | null>(null)
  const hasDraggedRef = useRef(false)
  const elRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const canResize = isFloatingType(widget.type)
  const canLongPressDrag = isDesktopIconWidgetType(widget.type)
  /** stretch-fill 类型不走 naturalSize/scale 等比缩放 */
  const stretchFill = isStretchFillType(widget.type)

  /** 记录内容的自然尺寸（fit-content 时测量） */
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null)
  /** 锚点中心 X：首次渲染后固定，样式切换时以此为基准 */
  const anchorCenterXRef = useRef<number | null>(null)
  /** 样式切换中，禁用过渡动画 */
  const [styleChanging, setStyleChanging] = useState(false)
  /** 用户手动调整的缩放倍数，跨样式保持 */
  const userScaleRef = useRef(1)

  /** 悬浮组件样式 key，切换时重置容器尺寸并保持顶部中心 */
  const configStyle = canResize ? String((widget.config as Record<string, unknown>)?.style ?? '') : ''
  const prevConfigStyle = useRef(configStyle)
  useEffect(() => {
    if (!stretchFill && prevConfigStyle.current !== configStyle && prevConfigStyle.current !== '') {
      // 记录锚点（仅首次）
      if (anchorCenterXRef.current === null) {
        const curW = naturalSizeRef.current?.w ?? elRef.current?.offsetWidth ?? 0
        anchorCenterXRef.current = posRef.current.x + curW / 2
      }
      // 记录当前用户缩放倍数
      if (naturalSizeRef.current && sizeRef.current.w > 0) {
        userScaleRef.current = Math.min(
          sizeRef.current.w / naturalSizeRef.current.w,
          sizeRef.current.h / naturalSizeRef.current.h
        )
      }
      naturalSizeRef.current = null
      setStyleChanging(true)
      setSize({ w: 0, h: 0 })
      sizeRef.current = { w: 0, h: 0 }
      // 双帧延迟：第一帧等 React 渲染 fit-content，第二帧测量
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (elRef.current && anchorCenterXRef.current !== null) {
            const newW = elRef.current.offsetWidth
            const newH = elRef.current.offsetHeight
            if (newW > 0 && newH > 0) {
              naturalSizeRef.current = { w: newW, h: newH }
              const s = userScaleRef.current
              if (s !== 1) {
                const scaledW = Math.round((newW * s) / GRID) * GRID
                const scaledH = Math.round((newH * s) / GRID) * GRID
                setSize({ w: scaledW, h: scaledH })
                sizeRef.current = { w: scaledW, h: scaledH }
                const newX = Math.max(EDGE_PADDING, anchorCenterXRef.current - scaledW / 2)
                setPos((p) => ({ ...p, x: newX }))
                posRef.current = { ...posRef.current, x: newX }
              } else {
                const newX = Math.max(EDGE_PADDING, anchorCenterXRef.current - newW / 2)
                setPos((p) => ({ ...p, x: newX }))
                posRef.current = { ...posRef.current, x: newX }
              }
            }
          }
          requestAnimationFrame(() => setStyleChanging(false))
        })
      })
    }
    prevConfigStyle.current = configStyle
  }, [configStyle, stretchFill])

  /** 在 fit-content 首次渲染后记录自然尺寸（等待字体就绪再测量） */
  useEffect(() => {
    if (canResize && !stretchFill && size.w === 0 && !naturalSizeRef.current && elRef.current) {
      let cancelled = false
      const measure = () => {
        if (cancelled || !elRef.current) return
        const w = elRef.current.offsetWidth
        const h = elRef.current.offsetHeight
        if (w > 0 && h > 0) {
          naturalSizeRef.current = { w, h }
        }
      }
      // 等字体全部就绪后再测量，避免像素字体等延迟加载字体导致尺寸偏差
      document.fonts.ready.then(() => {
        if (cancelled) return
        requestAnimationFrame(measure)
      })
      return () => {
        cancelled = true
      }
    }
    return undefined
  }, [canResize, stretchFill, size.w, size.h, configStyle])

  /**
   * 重启恢复：组件有保存的 size > 0 但 naturalSizeRef 为空。
   * 先临时设为 fit-content 测量自然尺寸，再恢复保存的尺寸。
   */
  const initialSizeRef = useRef({ w: widget.width, h: widget.height })
  const didRestoreRef = useRef(false)
  useEffect(() => {
    if (!canResize || didRestoreRef.current) return undefined
    if (stretchFill) {
      didRestoreRef.current = true
      return undefined
    }
    if (initialSizeRef.current.w > 0 && !naturalSizeRef.current) {
      let cancelled = false
      // 临时设为 fit-content 以测量
      setSize({ w: 0, h: 0 })
      sizeRef.current = { w: 0, h: 0 }
      // 等待字体就绪后再测量，避免像素字体等延迟加载字体导致尺寸偏差
      document.fonts.ready.then(() => {
        if (cancelled) return
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled || !elRef.current) {
              didRestoreRef.current = true
              return
            }
            const nw = elRef.current.offsetWidth
            const nh = elRef.current.offsetHeight
            if (nw > 0 && nh > 0) {
              naturalSizeRef.current = { w: nw, h: nh }
              // 初始化锚点中心
              const savedW = initialSizeRef.current.w
              const savedH = initialSizeRef.current.h
              anchorCenterXRef.current = posRef.current.x + savedW / 2
              // 计算用户缩放倍数
              userScaleRef.current = Math.min(savedW / nw, savedH / nh)
              // 恢复保存的尺寸
              setSize({ w: savedW, h: savedH })
              sizeRef.current = { w: savedW, h: savedH }
            }
            didRestoreRef.current = true
          })
        })
      })
      return () => {
        cancelled = true
      }
    } else {
      didRestoreRef.current = true
      return undefined
    }
  }, [canResize, stretchFill])

  /** 获取实际渲染尺寸（使用 DOM 实际尺寸，避免约束尺寸与视觉尺寸不一致） */
  const getActualSize = useCallback(() => {
    if (elRef.current) {
      const w = elRef.current.offsetWidth
      const h = elRef.current.offsetHeight
      if (w > 0 && h > 0) return { w, h }
    }
    return { w: size.w || 200, h: size.h || 100 }
  }, [size.w, size.h])

  const clearLongPressDrag = useCallback(() => {
    const pending = longPressDragRef.current
    if (pending) window.clearTimeout(pending.timer)
    longPressDragRef.current = null
  }, [])

  const clearInteractivePointer = useCallback(
    (pointerId: number) => {
      if (interactivePointerRef.current !== pointerId) return
      interactivePointerRef.current = null
      window.setTimeout(() => {
        if (!editing && !dragRef.current && !resizeRef.current && !longPressDragRef.current && !elRef.current?.matches(':hover')) {
          window.canvasBridge?.setIgnoreMouse(true)
        }
      }, 0)
    },
    [editing]
  )

  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (editing || !canLongPressDrag) return
      if (!(e.target as HTMLElement).closest('[data-desktop-icon-action]')) return
      interactivePointerRef.current = e.pointerId
      window.canvasBridge?.setIgnoreMouse(false)
    },
    [editing, canLongPressDrag]
  )

  const onPointerUpCapture = useCallback(
    (e: React.PointerEvent) => {
      clearInteractivePointer(e.pointerId)
    },
    [clearInteractivePointer]
  )

  const onPointerCancelCapture = useCallback(
    (e: React.PointerEvent) => {
      clearInteractivePointer(e.pointerId)
    },
    [clearInteractivePointer]
  )

  /** 计算缩放比例 */
  const scaleRatio =
    canResize && !stretchFill && naturalSizeRef.current && size.w > 0
      ? Math.min(size.w / naturalSizeRef.current.w, size.h / naturalSizeRef.current.h)
      : 1

  // 视觉内容尺寸 = naturalSize * scaleRatio，容器应匹配这个尺寸
  const visualW =
    canResize && !stretchFill && naturalSizeRef.current && size.w > 0 ? Math.round(naturalSizeRef.current.w * scaleRatio) : undefined
  const visualH =
    canResize && !stretchFill && naturalSizeRef.current && size.w > 0 ? Math.round(naturalSizeRef.current.h * scaleRatio) : undefined

  useEffect(() => {
    setPos({ x: widget.x, y: widget.y })
    posRef.current = { x: widget.x, y: widget.y }
  }, [widget.x, widget.y])

  useEffect(() => {
    // 恢复阶段中不要覆盖 size（restore 需要临时设为 0,0 测量自然尺寸）
    if (canResize && !didRestoreRef.current) return
    setSize({ w: widget.width, h: widget.height })
    sizeRef.current = { w: widget.width, h: widget.height }
  }, [canResize, widget.width, widget.height])

  useEffect(() => {
    if (pendingIconScale === null || !isIconStorageType(widget.type)) return
    if (Math.abs(readIconStorageScale(widget.config) - pendingIconScale) < 0.001) setPendingIconScale(null)
  }, [pendingIconScale, widget.config, widget.type])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      if (editing) {
        if ((e.target as HTMLElement).closest('[data-delete-btn]')) return
        if ((e.target as HTMLElement).closest('[data-toolbar]')) return
        // 检查是否点击了 resize handle
        const resizeEdge = (e.target as HTMLElement).closest('[data-resize]')?.getAttribute('data-resize')
        if (resizeEdge && canResize) {
          e.preventDefault()
          elRef.current?.setPointerCapture(e.pointerId)
          setResizing(true)
          const actual = getActualSize()
          resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: actual.w,
            origH: actual.h,
            origX: posRef.current.x,
            origY: posRef.current.y,
            edge: resizeEdge,
          }
          return
        }
        e.preventDefault()
        elRef.current?.setPointerCapture(e.pointerId)
        onSelect() // 点击/拖拽即选中
        setDragging(true)
        hasDraggedRef.current = false
        dragRef.current = { startX: e.clientX, startY: e.clientY, origX: posRef.current.x, origY: posRef.current.y }
        return
      }

      if (canLongPressDrag && (e.target as HTMLElement).closest('[data-desktop-icon-action]')) return

      if (canLongPressDrag && (e.target as HTMLElement).closest('[data-widget-drag-handle]')) {
        e.preventDefault()
        elRef.current?.setPointerCapture(e.pointerId)
        window.canvasBridge?.setIgnoreMouse(false)
        setDragging(true)
        hasDraggedRef.current = false
        dragRef.current = { startX: e.clientX, startY: e.clientY, origX: posRef.current.x, origY: posRef.current.y }
        return
      }

      if (canLongPressDrag) {
        e.preventDefault()
        elRef.current?.setPointerCapture(e.pointerId)
        const startX = e.clientX
        const startY = e.clientY
        const pointerId = e.pointerId
        const timer = window.setTimeout(() => {
          const pending = longPressDragRef.current
          if (!pending || pending.pointerId !== pointerId) return
          longPressDragRef.current = null
          window.canvasBridge?.setIgnoreMouse(false)
          setDragging(true)
          hasDraggedRef.current = false
          dragRef.current = { startX, startY, origX: posRef.current.x, origY: posRef.current.y }
        }, LONG_PRESS_WIDGET_DRAG_MS)
        longPressDragRef.current = { startX, startY, pointerId, timer }
      }
    },
    [editing, canResize, canLongPressDrag, getActualSize, onSelect]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (longPressDragRef.current && !dragRef.current) {
        const pending = longPressDragRef.current
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.abs(dx) > LONG_PRESS_WIDGET_CANCEL_PX || Math.abs(dy) > LONG_PRESS_WIDGET_CANCEL_PX) {
          clearLongPressDrag()
          if (elRef.current?.hasPointerCapture(e.pointerId)) elRef.current.releasePointerCapture(e.pointerId)
        }
        return
      }

      // 处理 resize
      if (resizeRef.current) {
        const r = resizeRef.current
        const dx = e.clientX - r.startX
        const dy = e.clientY - r.startY
        let nw = r.origW,
          nh = r.origH,
          nx = r.origX,
          ny = r.origY
        if (isIconStorageType(widget.type)) {
          const resized = getIconStorageCenteredResize(widget, r.edge, dx, dy, {
            x: r.origX,
            y: r.origY,
            w: r.origW,
            h: r.origH,
          })
          nw = resized.w
          nh = resized.h
          nx = resized.x
          ny = resized.y
          r.nextIconScale = resized.iconScale
        } else {
          if (r.edge.includes('r')) nw = Math.max(MIN_SIZE, r.origW + dx)
          if (r.edge.includes('b')) nh = Math.max(MIN_SIZE, r.origH + dy)
          if (r.edge.includes('l')) {
            const dw = Math.min(dx, r.origW - MIN_SIZE)
            nw = r.origW - dw
            nx = r.origX + dw
          }
          if (r.edge.includes('t')) {
            const dh = Math.min(dy, r.origH - MIN_SIZE)
            nh = r.origH - dh
            ny = r.origY + dh
          }
          // 吸附到网格
          nw = Math.round(nw / GRID) * GRID
          nh = Math.round(nh / GRID) * GRID
          nx = Math.round(nx / GRID) * GRID
          ny = Math.round(ny / GRID) * GRID
          nw = Math.max(MIN_SIZE, nw)
          nh = Math.max(MIN_SIZE, nh)
        }
        setSize({ w: nw, h: nh })
        sizeRef.current = { w: nw, h: nh }
        setPos({ x: nx, y: ny })
        posRef.current = { x: nx, y: ny }
        return
      }
      // 处理 drag
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true
      let nx = Math.round((dragRef.current.origX + dx) / GRID) * GRID
      let ny = Math.round((dragRef.current.origY + dy) / GRID) * GRID
      const curW = elRef.current?.offsetWidth || size.w || 200
      const curH = elRef.current?.offsetHeight || size.h || 100
      const maxX = window.innerWidth - EDGE_PADDING - curW
      const maxY = window.innerHeight - BOTTOM_EDGE_PADDING - curH
      nx = Math.max(EDGE_PADDING, Math.min(nx, Math.max(EDGE_PADDING, maxX)))
      ny = Math.max(EDGE_PADDING, Math.min(ny, Math.max(EDGE_PADDING, maxY)))
      setPos({ x: nx, y: ny })
      posRef.current = { x: nx, y: ny }
      // 实时计算吸附预览
      const curW2 = elRef.current?.offsetWidth || size.w || 200
      const curH2 = elRef.current?.offsetHeight || size.h || 100
      onDragPreview(widget.id, { x: nx, y: ny, w: curW2, h: curH2 })
    },
    [clearLongPressDrag, size.w, size.h, onDragPreview, widget]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (elRef.current?.hasPointerCapture(e.pointerId)) elRef.current.releasePointerCapture(e.pointerId)
      clearInteractivePointer(e.pointerId)
      if (longPressDragRef.current && !dragRef.current) {
        clearLongPressDrag()
        return
      }
      if (resizeRef.current) {
        const resize = resizeRef.current
        resizeRef.current = null
        setResizing(false)
        if (typeof resize.nextIconScale === 'number') setPendingIconScale(resize.nextIconScale)
        // 保存视觉尺寸（DOM 实际渲染尺寸），避免约束尺寸不断膨胀
        const vis = getActualSize()
        setSize({ w: vis.w, h: vis.h })
        sizeRef.current = { w: vis.w, h: vis.h }
        const updated = {
          ...widget,
          x: posRef.current.x,
          y: posRef.current.y,
          width: vis.w,
          height: vis.h,
          config: getIconStorageResizeConfig(
            widget,
            resize.edge,
            vis.w,
            vis.h,
            resize.origW,
            resize.origH,
            resize.nextIconScale
          ),
        }
        window.canvasBridge?.updateWidget(updated)
        onResolveCollisions(widget.id, { x: posRef.current.x, y: posRef.current.y, w: vis.w, h: vis.h })
        return
      }
      if (dragRef.current) {
        dragRef.current = null
        setDragging(false)
        const vis = getActualSize()
        // 拖拽后更新锚点中心
        anchorCenterXRef.current = posRef.current.x + vis.w / 2
        const updated = { ...widget, x: posRef.current.x, y: posRef.current.y, width: vis.w, height: vis.h }
        window.canvasBridge?.updateWidget(updated)
        onResolveCollisions(widget.id, { x: posRef.current.x, y: posRef.current.y, w: vis.w, h: vis.h })
      }
    },
    [clearLongPressDrag, widget, onResolveCollisions, getActualSize]
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (elRef.current?.hasPointerCapture(e.pointerId)) elRef.current.releasePointerCapture(e.pointerId)
      clearInteractivePointer(e.pointerId)
      clearLongPressDrag()
      dragRef.current = null
      resizeRef.current = null
      setPendingIconScale(null)
      setDragging(false)
      setResizing(false)
    },
    [clearLongPressDrag]
  )

  const onContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const action = await window.canvasBridge?.showContextMenu(widget.id)
      if (action === 'edit') onEnterEdit()
      if (action === 'delete' && !editing) window.canvasBridge?.setIgnoreMouse(true)
    },
    [widget.id, onEnterEdit, editing]
  )

  const posValue = useMemo(() => ({ x: pos.x, y: pos.y }), [pos.x, pos.y])

  const showToolbar = editing && selected && hasFloatingToolbar(widget.type)
  const isActive = dragging || resizing
  const liveIconScale =
    resizing && isIconStorageType(widget.type) && typeof resizeRef.current?.nextIconScale === 'number'
      ? resizeRef.current.nextIconScale
      : pendingIconScale !== null && isIconStorageType(widget.type)
        ? pendingIconScale
      : undefined
  const renderWidgetInstance =
    liveIconScale === undefined
      ? widget
      : {
          ...widget,
          width: size.w,
          height: size.h,
          config: { ...(widget.config ?? {}), iconScale: liveIconScale },
        }

  return (
    <div
      ref={elRef}
      data-widget={widget.id}
      onMouseEnter={() => window.canvasBridge?.setIgnoreMouse(false)}
      onMouseLeave={() => {
        if (!dragRef.current && !resizeRef.current && !longPressDragRef.current && interactivePointerRef.current === null && !editing) {
          window.canvasBridge?.setIgnoreMouse(true)
        }
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerCancelCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: canResize ? (size.w > 0 ? (stretchFill ? size.w : (visualW ?? size.w)) : 'fit-content') : size.w,
        height: canResize ? (size.h > 0 ? (stretchFill ? size.h : (visualH ?? size.h)) : 'fit-content') : size.h,
        overflow: 'visible',
        borderRadius: 16,
        pointerEvents: 'auto',
        cursor: editing ? (dragging ? 'grabbing' : 'grab') : 'default',
        transition:
          isActive || styleChanging ? 'none' : 'left 0.25s ease, top 0.25s ease, width 0.2s ease, height 0.2s ease',
        touchAction: 'none',
      }}
    >
      {/* 选中边框 */}
      {editing && (
        <div
          style={{
            position: 'absolute',
            inset: -2,
            border: selected ? '2px solid rgba(59,130,246,0.8)' : '2px dashed rgba(255,255,255,0.6)',
            borderRadius: 18,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Resize handles（仅选中的悬浮组件） */}
      {editing && selected && canResize && (
        <>
          {/* 四角 */}
          <ResizeHandle edge="tl" cursor="nwse-resize" style={{ top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }} />
          <ResizeHandle edge="tr" cursor="nesw-resize" style={{ top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }} />
          <ResizeHandle edge="bl" cursor="nesw-resize" style={{ bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 }} />
          <ResizeHandle edge="br" cursor="nwse-resize" style={{ bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 }} />
          {/* 四边 */}
          <ResizeHandle edge="t" cursor="ns-resize" style={{ top: -4, left: '15%', right: '15%', height: 8 }} bar />
          <ResizeHandle edge="b" cursor="ns-resize" style={{ bottom: -4, left: '15%', right: '15%', height: 8 }} bar />
          <ResizeHandle edge="l" cursor="ew-resize" style={{ left: -4, top: '15%', bottom: '15%', width: 8 }} bar />
          <ResizeHandle edge="r" cursor="ew-resize" style={{ right: -4, top: '15%', bottom: '15%', width: 8 }} bar />
        </>
      )}
      {/* 删除按钮 */}
      {editing && !showToolbar && (
        <button
          data-delete-btn
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 24,
            height: 24,
            borderRadius: 12,
            border: 'none',
            background: 'rgba(220, 38, 38, 0.9)',
            color: '#fff',
            fontSize: 14,
            lineHeight: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            zIndex: 10,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          ✕
        </button>
      )}
      {/* 浮动设置工具栏 — 始终居中在组件上方 */}
      {showToolbar && (
        <div
          data-toolbar
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: 12,
            zIndex: 50,
          }}
        >
          <FloatingToolbar
            widgetType={widget.type}
            config={widget.config || {}}
            updateConfig={onUpdateConfig}
            onDelete={onDelete}
          />
        </div>
      )}
      <WidgetPosCtx.Provider value={posValue}>
        <div
          ref={contentRef}
          style={{
            width: canResize && !stretchFill && naturalSizeRef.current ? naturalSizeRef.current.w : '100%',
            height: canResize && !stretchFill && naturalSizeRef.current ? naturalSizeRef.current.h : '100%',
            overflow: canResize ? 'visible' : 'hidden',
            borderRadius: canResize ? 0 : 16,
            position: 'relative',
            zIndex: 0,
            transform: canResize && !stretchFill && scaleRatio !== 1 ? `scale(${scaleRatio})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {renderWidget(renderWidgetInstance, { editing, resizing })}
        </div>
      </WidgetPosCtx.Provider>
    </div>
  )
}

/** Resize 拖拽手柄 */
function ResizeHandle({
  edge,
  cursor,
  style,
  bar,
}: {
  edge: string
  cursor: string
  style: React.CSSProperties
  bar?: boolean
}) {
  return (
    <div
      data-resize={edge}
      style={{
        position: 'absolute',
        ...style,
        ...(bar
          ? { borderRadius: 4, background: 'rgba(59,130,246,0.5)', backdropFilter: 'blur(2px)' }
          : {
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: HANDLE_SIZE / 2,
              background: '#fff',
              border: '2.5px solid rgba(59,130,246,0.9)',
              boxShadow: '0 0 4px rgba(0,0,0,0.3)',
            }),
        cursor,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    />
  )
}
