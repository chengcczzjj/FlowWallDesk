import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetInstance } from '@shared/types'
import { renderWidget, hasFloatingToolbar, isFloatingType, isStretchFillType } from '../widgets'
import { FloatingToolbar } from '../widgets/FloatingToolbar'
import { WallpaperFrameCtx, WidgetPosCtx } from './contexts'

const GRID = 16
const EDGE_PADDING = 24
const TASKBAR_MARGIN = 56
const MIN_SIZE = 80
const HANDLE_SIZE = 14

/**
 * 桌面组件画布：单个全屏透明窗口，所有桌面组件渲染在此。
 *
 * 编辑模式：右键 → 原生菜单 → 全局编辑，点击空白退出。
 * 选中组件后显示设置工具栏。
 */
export function Canvas() {
  const [widgets, setWidgets] = useState<WidgetInstance[]>([])
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)

  useEffect(() => {
    window.canvasBridge?.getWidgets().then((list) => setWidgets(list))
    const offSync = window.canvasBridge?.onSync((list) => setWidgets(list))
    const offFrame = window.canvasBridge?.onFrame((data) => setFrame(data))
    return () => { offSync?.(); offFrame?.() }
  }, [])

  useEffect(() => {
    window.canvasBridge?.setEditMode(editing)
    if (!editing) setSelectedId(null)
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

  const updateWidgetConfig = useCallback((id: string, newConfig: Record<string, unknown>) => {
    setWidgets((prev) => {
      const updated = prev.map((w) =>
        w.id === id ? { ...w, config: { ...(w.config || {}), ...newConfig } } : w
      )
      // 仅保存 config，不触发位置吸附
      window.canvasBridge?.updateWidgetConfig(id, newConfig)
      return updated
    })
  }, [])

  const saveToWallpaper = useCallback(() => {
    window.canvasBridge?.saveWidgetConfig?.()
  }, [])

  /** 碰撞检测：将被遮挡的组件推开 */
  const resolveCollisions = useCallback((movedId: string, movedRect: { x: number; y: number; w: number; h: number }) => {
    // 使用 DOM 实际尺寸修正碰撞矩形（悬浮组件等比缩放后实际尺寸 < 逻辑尺寸）
    const movedEl = document.querySelector(`[data-widget="${movedId}"]`) as HTMLElement | null
    const rect = {
      x: movedRect.x,
      y: movedRect.y,
      w: movedEl?.offsetWidth || movedRect.w,
      h: movedEl?.offsetHeight || movedRect.h,
    }
    setWidgets((prev) => {
      const updated = [...prev]
      let changed = false
      for (const other of updated) {
        if (other.id === movedId || !other.enabled) continue
        const el = document.querySelector(`[data-widget="${other.id}"]`) as HTMLElement | null
        const ox = other.x, oy = other.y
        const ow = el?.offsetWidth || other.width || 160
        const oh = el?.offsetHeight || other.height || 160
        const overlapX = rect.x < ox + ow && rect.x + rect.w > ox
        const overlapY = rect.y < oy + oh && rect.y + rect.h > oy
        if (overlapX && overlapY) {
          // 根据两组件中心的相对方向决定推开方向（不受重叠深度影响，快慢拖动一致）
          const mCx = rect.x + rect.w / 2
          const mCy = rect.y + rect.h / 2
          const oCx = ox + ow / 2
          const oCy = oy + oh / 2
          const dx = oCx - mCx
          const dy = oCy - mCy
          if (Math.abs(dx) >= Math.abs(dy)) {
            // 水平推开
            other.x = dx >= 0 ? rect.x + rect.w + GRID : rect.x - ow - GRID
          } else {
            // 垂直推开
            other.y = dy >= 0 ? rect.y + rect.h + GRID : rect.y - oh - GRID
          }
          // 限制范围
          other.x = Math.max(EDGE_PADDING, Math.min(other.x, window.innerWidth - EDGE_PADDING - ow))
          other.y = Math.max(EDGE_PADDING, Math.min(other.y, window.innerHeight - TASKBAR_MARGIN - oh))
          window.canvasBridge?.updateWidget(other)
          changed = true
        }
      }
      return changed ? updated : prev
    })
  }, [])

  return (
    <WallpaperFrameCtx.Provider value={frame}>
      <div
        style={{ width: '100%', height: '100%', position: 'relative' }}
        onClick={onBgClick}
      >
        {widgets
          .filter((w) => w.enabled)
          .map((w) => (
            <DraggableWidget
              key={w.id}
              widget={w}
              editing={editing}
              selected={selectedId === w.id}
              onSelect={() => { if (editing) setSelectedId(w.id) }}
              onEnterEdit={() => setEditing(true)}
              onUpdateConfig={(cfg) => updateWidgetConfig(w.id, cfg)}
              onDelete={() => window.canvasBridge?.removeWidget(w.id)}
              onSaveToWallpaper={saveToWallpaper}
              onResolveCollisions={resolveCollisions}
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
  onSaveToWallpaper,
  onResolveCollisions,
}: {
  widget: WidgetInstance
  editing: boolean
  selected: boolean
  onSelect: () => void
  onEnterEdit: () => void
  onUpdateConfig: (config: Record<string, unknown>) => void
  onDelete: () => void
  onSaveToWallpaper: () => void
  onResolveCollisions: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [pos, setPos] = useState({ x: widget.x, y: widget.y })
  const posRef = useRef(pos)
  const [size, setSize] = useState({ w: widget.width, h: widget.height })
  const sizeRef = useRef(size)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; edge: string } | null>(null)
  const hasDraggedRef = useRef(false)
  const elRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const canResize = isFloatingType(widget.type)
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
    if (prevConfigStyle.current !== configStyle && prevConfigStyle.current !== '') {
      // 记录锚点（仅首次）
      if (anchorCenterXRef.current === null) {
        const curW = naturalSizeRef.current?.w ?? (elRef.current?.offsetWidth ?? 0)
        anchorCenterXRef.current = posRef.current.x + curW / 2
      }
      // 记录当前用户缩放倍数
      if (naturalSizeRef.current && sizeRef.current.w > 0) {
        userScaleRef.current = Math.min(sizeRef.current.w / naturalSizeRef.current.w, sizeRef.current.h / naturalSizeRef.current.h)
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
                const scaledW = Math.round(newW * s / GRID) * GRID
                const scaledH = Math.round(newH * s / GRID) * GRID
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
  }, [configStyle])

  /** 在 fit-content 首次渲染后记录自然尺寸 */
  useEffect(() => {
    if (canResize && size.w === 0 && !naturalSizeRef.current && elRef.current) {
      const measure = () => {
        if (elRef.current) {
          const w = elRef.current.offsetWidth
          const h = elRef.current.offsetHeight
          if (w > 0 && h > 0) {
            naturalSizeRef.current = { w, h }
          }
        }
      }
      requestAnimationFrame(measure)
    }
  }, [canResize, size.w, size.h, configStyle])

  /**
   * 重启恢复：组件有保存的 size > 0 但 naturalSizeRef 为空。
   * 先临时设为 fit-content 测量自然尺寸，再恢复保存的尺寸。
   */
  const initialSizeRef = useRef({ w: widget.width, h: widget.height })
  const didRestoreRef = useRef(false)
  useEffect(() => {
    if (!canResize || didRestoreRef.current) return
    if (initialSizeRef.current.w > 0 && !naturalSizeRef.current) {
      // 临时设为 fit-content 以测量
      setSize({ w: 0, h: 0 })
      sizeRef.current = { w: 0, h: 0 }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (elRef.current) {
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
          }
          didRestoreRef.current = true
        })
      })
    } else {
      didRestoreRef.current = true
    }
  }, [canResize])

  /** 获取实际渲染尺寸 */
  const getActualSize = useCallback(() => {
    if (canResize && size.w === 0 && elRef.current) {
      return { w: elRef.current.offsetWidth, h: elRef.current.offsetHeight }
    }
    return { w: size.w || 200, h: size.h || 100 }
  }, [canResize, size.w, size.h])

  /** 计算缩放比例 */
  const scaleRatio = canResize && naturalSizeRef.current && size.w > 0
    ? Math.min(size.w / naturalSizeRef.current.w, size.h / naturalSizeRef.current.h)
    : 1

  // 视觉内容尺寸 = naturalSize * scaleRatio，容器应匹配这个尺寸
  const visualW = canResize && naturalSizeRef.current && size.w > 0
    ? Math.round(naturalSizeRef.current.w * scaleRatio)
    : undefined
  const visualH = canResize && naturalSizeRef.current && size.w > 0
    ? Math.round(naturalSizeRef.current.h * scaleRatio)
    : undefined

  useEffect(() => {
    setPos({ x: widget.x, y: widget.y })
    posRef.current = { x: widget.x, y: widget.y }
  }, [widget.x, widget.y])

  useEffect(() => {
    // 恢复阶段中不要覆盖 size（restore 需要临时设为 0,0 测量自然尺寸）
    if (canResize && !didRestoreRef.current) return
    setSize({ w: widget.width, h: widget.height })
    sizeRef.current = { w: widget.width, h: widget.height }
  }, [widget.width, widget.height])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
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
          startX: e.clientX, startY: e.clientY,
          origW: actual.w, origH: actual.h,
          origX: posRef.current.x, origY: posRef.current.y,
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
    }
  }, [editing, canResize, onSelect])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // 处理 resize
    if (resizeRef.current) {
      const r = resizeRef.current
      const dx = e.clientX - r.startX
      const dy = e.clientY - r.startY
      let nw = r.origW, nh = r.origH, nx = r.origX, ny = r.origY
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
    const curSize = canResize && size.w === 0 ? { w: elRef.current?.offsetWidth ?? 200, h: elRef.current?.offsetHeight ?? 100 } : { w: size.w, h: size.h }
    const maxX = window.innerWidth - EDGE_PADDING - curSize.w
    const maxY = window.innerHeight - TASKBAR_MARGIN - curSize.h
    nx = Math.max(EDGE_PADDING, Math.min(nx, Math.max(EDGE_PADDING, maxX)))
    ny = Math.max(EDGE_PADDING, Math.min(ny, Math.max(EDGE_PADDING, maxY)))
    setPos({ x: nx, y: ny })
    posRef.current = { x: nx, y: ny }
  }, [size.w, size.h])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    elRef.current?.releasePointerCapture(e.pointerId)
    if (resizeRef.current) {
      resizeRef.current = null
      setResizing(false)
      const updated = { ...widget, x: posRef.current.x, y: posRef.current.y, width: sizeRef.current.w, height: sizeRef.current.h }
      window.canvasBridge?.updateWidget(updated)
      onResolveCollisions(widget.id, { x: posRef.current.x, y: posRef.current.y, w: sizeRef.current.w, h: sizeRef.current.h })
      return
    }
    if (dragRef.current) {
      dragRef.current = null
      setDragging(false)
      const actualW = sizeRef.current.w > 0 ? sizeRef.current.w : (elRef.current?.offsetWidth ?? 200)
      const actualH = sizeRef.current.h > 0 ? sizeRef.current.h : (elRef.current?.offsetHeight ?? 100)
      // 拖拽后更新锚点中心
      anchorCenterXRef.current = posRef.current.x + actualW / 2
      const updated = { ...widget, x: posRef.current.x, y: posRef.current.y, width: actualW, height: actualH }
      window.canvasBridge?.updateWidget(updated)
      onResolveCollisions(widget.id, { x: posRef.current.x, y: posRef.current.y, w: actualW, h: actualH })
    }
  }, [widget, onResolveCollisions])

  const onContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const action = await window.canvasBridge?.showContextMenu(widget.id)
    if (action === 'edit') onEnterEdit()
  }, [widget.id, onEnterEdit])

  const posValue = useMemo(() => ({ x: pos.x, y: pos.y }), [pos.x, pos.y])

  const showToolbar = editing && selected && hasFloatingToolbar(widget.type)
  const isActive = dragging || resizing

  return (
    <div
      ref={elRef}
      data-widget={widget.id}
      onMouseEnter={() => window.canvasBridge?.setIgnoreMouse(false)}
      onMouseLeave={() => {
        if (!dragRef.current && !resizeRef.current && !editing) window.canvasBridge?.setIgnoreMouse(true)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
        transition: (isActive || styleChanging) ? 'none' : 'left 0.25s ease, top 0.25s ease, width 0.2s ease, height 0.2s ease',
        touchAction: 'none',
      }}
    >
      {/* 选中边框 */}
      {editing && (
        <div style={{
          position: 'absolute', inset: -2,
          border: selected ? '2px solid rgba(59,130,246,0.8)' : '2px dashed rgba(255,255,255,0.6)',
          borderRadius: 18, pointerEvents: 'none',
        }} />
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
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: -8, right: -8,
            width: 24, height: 24, borderRadius: 12,
            border: 'none', background: 'rgba(220, 38, 38, 0.9)',
            color: '#fff', fontSize: 14, lineHeight: '24px',
            textAlign: 'center', cursor: 'pointer', zIndex: 10,
            padding: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', backdropFilter: 'blur(4px)',
          }}
        >
          ✕
        </button>
      )}
      {/* 浮动设置工具栏 — 始终居中在组件上方 */}
      {showToolbar && (
        <div data-toolbar style={{
          position: 'absolute',
          left: '50%',
          bottom: '100%',
          transform: 'translateX(-50%)',
          marginBottom: 12,
          zIndex: 50,
        }}>
          <FloatingToolbar
            widgetType={widget.type}
            config={widget.config || {}}
            updateConfig={onUpdateConfig}
            onDelete={onDelete}
            onSaveToWallpaper={onSaveToWallpaper}
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
            position: 'relative', zIndex: 0,
            transform: canResize && !stretchFill && scaleRatio !== 1 ? `scale(${scaleRatio})` : undefined,
            transformOrigin: 'top left',
          }}>
          {renderWidget(widget)}
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
          : { width: HANDLE_SIZE, height: HANDLE_SIZE, borderRadius: HANDLE_SIZE / 2, background: '#fff', border: '2.5px solid rgba(59,130,246,0.9)', boxShadow: '0 0 4px rgba(0,0,0,0.3)' }),
        cursor,
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    />
  )
}
