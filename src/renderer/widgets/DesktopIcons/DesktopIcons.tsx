import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { AppWindow, File as FileGlyph, Folder, Plus } from 'lucide-react'
import type { DesktopIconItem, WidgetInstance } from '@shared/types'
import { DesktopInteractionEpochCtx, WidgetPosCtx } from '../../canvas/contexts'
import { FrostedGlassBackground } from '../FrostedGlassBackground'
import { toRendererPublicUrl } from '@shared/asset-url'
import {
  DOCK_BOUNCE_DURATION_SECONDS,
  DOCK_BOUNCE_RESET_MS,
  DOCK_BOUNCE_TIMES,
  getDockBounceKeyframes,
} from '@shared/dock-motion'

type DesktopIconVariant = 'vertical' | 'horizontal' | 'adaptive' | 'dock'
type StorageVariant = Exclude<DesktopIconVariant, 'dock'>
type StorageChromeStyle = 'plain' | 'titled'
type DockChromeStyle = 'glass' | 'trapezoid'
type DockSystemActionId = 'settings' | 'explorer' | 'recycle-bin' | 'desktop'

const CELL_WIDTH = 78
const CELL_HEIGHT = 88
const CELL_HEIGHT_COMPACT = 64
const ICON_SIZE = 48
const STORAGE_GAP_X = 12
const STORAGE_GAP_Y = 16
const STORAGE_GAP_Y_COMPACT = 8
const STORAGE_PADDING = 22
const STORAGE_PLAIN_RADIUS = 18
const STORAGE_TITLED_RADIUS = 8
const DOCK_GAP = 8
const DOCK_HORIZONTAL_INSET = 12
const DOCK_SLOT_EXTRA = 18
const DOCK_MIN_WIDTH = 96
const DOCK_EMPTY_WIDTH = 340
const DOCK_TRAPEZOID_SIDE_EXTRA = 48
const DOCK_DEFAULT_TINT = '#ffffff'
const DOCK_DEFAULT_OPACITY = 0.18
const DOCK_DEFAULT_TINT_STRENGTH = 0.1
const DOCK_DEFAULT_BLUR = 16
const DOCK_DEFAULT_HOVER_SCALE = 1.58
const DOUBLE_CLICK_MS = 420
const LONG_PRESS_REORDER_MS = 1000
const POINTER_CANCEL_PX = 8
const DRAG_MOVE_PX = 4
const STORAGE_SCALE_MIN = 0.65
const STORAGE_SCALE_MAX = 1.8
const STORAGE_DEFAULT_TINT = '#ffffff'
const STORAGE_DEFAULT_OPACITY = 0.08
const STORAGE_DEFAULT_TINT_STRENGTH = 0.04
const STORAGE_DEFAULT_BLUR = 15

const DOCK_SYSTEM_ACTIONS: Array<{ id: DockSystemActionId; label: string }> = [
  { id: 'settings', label: '设置' },
  { id: 'explorer', label: '资源管理器' },
  { id: 'recycle-bin', label: '回收站' },
  { id: 'desktop', label: '回到桌面' },
]
const STORAGE_TITLE_HEIGHT = 38

interface DragState {
  id: string
  variant: DesktopIconVariant
  startClientX: number
  startClientY: number
  moved: boolean
  active: boolean
  cancelled: boolean
  longPressTimer: number | null
  currentItems: DesktopIconItem[]
}

interface PositionedIcon {
  item: DesktopIconItem
  x: number
  y: number
}

interface StorageLayout {
  items: PositionedIcon[]
  contentWidth: number
  contentHeight: number
  columns: number
  rows: number
  originX: number
  originY: number
}

interface AdaptiveSizing {
  columns: number
  rows: number
  width: number
  height: number
}

interface StorageMetrics {
  scale: number
  cellWidth: number
  cellHeight: number
  iconSize: number
  gapX: number
  gapY: number
  padding: number
  minWidth: number
  minHeight: number
  labelFontSize: number
  labelMarginTop: number
}

interface StorageAppearance {
  tintColor: string
  tintStrength: number
  opacity: number
  blurPx: number
  chromeStyle: StorageChromeStyle
  title: string
}

interface DockAppearance {
  tintColor: string
  tintStrength: number
  opacity: number
  blurPx: number
  chromeStyle: DockChromeStyle
  showReflection: boolean
  hoverScale: number
}

export function DesktopIconBox({
  widget,
  editing = false,
  resizing = false,
}: {
  widget: WidgetInstance
  editing?: boolean
  resizing?: boolean
}) {
  return <DesktopIconsWidget widget={widget} variant="vertical" editing={editing} resizing={resizing} />
}

export function DesktopIconHorizontal({
  widget,
  editing = false,
  resizing = false,
}: {
  widget: WidgetInstance
  editing?: boolean
  resizing?: boolean
}) {
  return <DesktopIconsWidget widget={widget} variant="horizontal" editing={editing} resizing={resizing} />
}

export function DesktopIconAdaptive({
  widget,
  editing = false,
  resizing = false,
}: {
  widget: WidgetInstance
  editing?: boolean
  resizing?: boolean
}) {
  return <DesktopIconsWidget widget={widget} variant="adaptive" editing={editing} resizing={resizing} />
}

export function DesktopIconDock({ widget, editing = false }: { widget: WidgetInstance; editing?: boolean }) {
  return <DesktopIconsWidget widget={widget} variant="dock" editing={editing} resizing={false} />
}

function DesktopIconsWidget({
  widget,
  variant,
  editing,
  resizing,
}: {
  widget: WidgetInstance
  variant: DesktopIconVariant
  editing: boolean
  resizing: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const draftItemsRef = useRef<DesktopIconItem[] | null>(null)
  const dropDepthRef = useRef(0)
  const lastClickRef = useRef<{ id: string; at: number } | null>(null)
  const lastActivationRef = useRef<{ id: string; at: number } | null>(null)
  const suppressActivationRef = useRef<{ id: string; until: number } | null>(null)
  const refreshedIdsRef = useRef<Set<string>>(new Set())
  const [containerSize, setContainerSize] = useState({ width: widget.width || 360, height: widget.height || 260 })
  const [dropActive, setDropActive] = useState(false)
  const [draftItems, setDraftItems] = useState<DesktopIconItem[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [hoveredStorageId, setHoveredStorageId] = useState<string | null>(null)
  const [bouncingId, setBouncingId] = useState<string | null>(null)
  const interactionEpoch = useContext(DesktopInteractionEpochCtx)
  const liveWidgetPos = useContext(WidgetPosCtx)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const borderBox = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
      setContainerSize({
        width: Math.round(borderBox?.inlineSize ?? entry.contentRect.width),
        height: Math.round(borderBox?.blockSize ?? entry.contentRect.height),
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const storedItems = useMemo(() => readItems(widget.config), [widget.config])
  const orderedItems = useMemo(() => orderItems(storedItems), [storedItems])
  const renderedItems = draftItems ?? orderedItems
  const storageScale = useMemo(() => (variant === 'dock' ? 1 : readStorageScale(widget.config)), [variant, widget.config])
  const storageHideLabels = variant !== 'dock' && widget.config?.storageHideLabels === true
  const storageMetrics = useMemo(() => createStorageMetrics(storageScale, storageHideLabels), [storageScale, storageHideLabels])
  const storageAppearance = useMemo(
    () => (variant === 'dock' ? null : readStorageAppearance(widget.config)),
    [variant, widget.config]
  )
  const dockAppearance = useMemo(
    () => (variant === 'dock' ? readDockAppearance(widget.config) : null),
    [variant, widget.config]
  )
  const titleHeight = storageAppearance?.chromeStyle === 'titled' ? STORAGE_TITLE_HEIGHT : 0
  const storageContentHeight = Math.max(1, containerSize.height - titleHeight)
  const adaptiveManualColumns = useMemo(
    () => (variant === 'adaptive' ? readAdaptiveManualColumns(widget.config) : null),
    [variant, widget.config]
  )
  const adaptiveSizing = useMemo(
    () => (variant === 'adaptive' ? getAdaptiveSizing(renderedItems.length, adaptiveManualColumns, storageMetrics) : null),
    [adaptiveManualColumns, renderedItems.length, storageMetrics, variant]
  )
  const storageLayout = useMemo(
    () =>
      variant === 'dock'
        ? null
        : createStorageLayout(
            renderedItems,
            variant,
            adaptiveSizing?.width ?? containerSize.width,
            storageContentHeight,
            storageMetrics,
            adaptiveSizing?.columns,
            adaptiveSizing?.rows
          ),
    [
      adaptiveSizing?.columns,
      adaptiveSizing?.rows,
      adaptiveSizing?.width,
      containerSize.width,
      renderedItems,
      storageContentHeight,
      storageMetrics,
      variant,
    ]
  )
  const dockItems = useMemo(() => orderItems(renderedItems), [renderedItems])
  const dockDisplayItemCount = dockItems.length + DOCK_SYSTEM_ACTIONS.length
  const dockFlipped = variant === 'dock' && isDockInUpperHalf(liveWidgetPos.y, containerSize.height)

  const setDraft = useCallback((nextItems: DesktopIconItem[] | null) => {
    draftItemsRef.current = nextItems
    setDraftItems(nextItems)
  }, [])

  const resetInteraction = useCallback(() => {
    const drag = dragRef.current
    if (drag) clearDragTimer(drag)
    dragRef.current = null
    dropDepthRef.current = 0
    lastClickRef.current = null
    lastActivationRef.current = null
    suppressActivationRef.current = null
    setDropActive(false)
    setDraggingId(null)
    setHoverIndex(null)
    setHoveredStorageId(null)
    setBouncingId(null)
    setDraft(null)
  }, [setDraft])

  useEffect(() => {
    if (!editing) return
    resetInteraction()
  }, [editing, resetInteraction])

  useEffect(() => {
    resetInteraction()
  }, [interactionEpoch, resetInteraction])

  useEffect(() => () => {
    const drag = dragRef.current
    if (drag) clearDragTimer(drag)
  }, [])

  useEffect(() => {
    if (variant === 'dock') {
      const desiredWidth = getDockPreferredWidth(dockDisplayItemCount, containerSize.height, dockAppearance?.chromeStyle, dockItems.length === 0)
      if (Math.abs(widget.width - desiredWidth) < 2) return
      const nextX = clampWidgetX(widget.x - (desiredWidth - widget.width) / 2, desiredWidth)
      void window.canvasBridge.updateWidget({ ...widget, x: nextX, width: desiredWidth })
      return
    }

    if (variant !== 'adaptive' || !adaptiveSizing) return
    if (resizing) return
    const desiredHeight = adaptiveSizing.height + titleHeight
    const desiredWidth = adaptiveSizing.width
    if (Math.abs(widget.height - desiredHeight) < 2 && Math.abs(widget.width - desiredWidth) < 2) return
    const nextX = Math.abs(widget.width - desiredWidth) >= 2 ? clampWidgetX(widget.x - (desiredWidth - widget.width) / 2, desiredWidth) : widget.x
    void window.canvasBridge.updateWidget({ ...widget, x: nextX, width: desiredWidth, height: desiredHeight })
  }, [adaptiveSizing, containerSize.height, dockAppearance?.chromeStyle, dockDisplayItemCount, dockItems.length, resizing, titleHeight, variant, widget])

  useEffect(() => {
    if (variant === 'dock' || variant === 'adaptive') return
    if (storageAppearance?.chromeStyle !== 'titled') return
    if (widget.config?.storageTitleExpanded === true) return
    void window.canvasBridge.updateWidget({
      ...widget,
      height: widget.height + STORAGE_TITLE_HEIGHT,
      config: { ...(widget.config ?? {}), storageTitleExpanded: true },
    })
  }, [storageAppearance?.chromeStyle, variant, widget])

  const updateDraft = useCallback(
    (updater: (currentItems: DesktopIconItem[] | null) => DesktopIconItem[] | null) => {
      setDraft(updater(draftItemsRef.current))
    },
    [setDraft]
  )

  const saveItems = useCallback(
    async (nextItems: DesktopIconItem[]) => {
      const normalized = nextItems.map((item, index) => ({ ...item, order: index, x: undefined, y: undefined }))
      await window.canvasBridge.updateWidgetConfig(widget.id, { items: normalized })
    },
    [widget.id]
  )

  useEffect(() => {
    const staleItems = orderedItems.filter((item) => !refreshedIdsRef.current.has(item.id) && needsMetadataRefresh(item))
    if (staleItems.length === 0) return undefined

    for (const item of staleItems) refreshedIdsRef.current.add(item.id)
    let cancelled = false
    void window.canvasBridge.refreshDesktopIcons(staleItems).catch((error) => {
      if (cancelled) return
      console.warn('[desktop-icons] refresh failed:', error instanceof Error ? error.message : String(error))
    })

    return () => {
      cancelled = true
    }
  }, [orderedItems])

  const activateItem = useCallback(
    (item: DesktopIconItem) => {
      if (editing) return
      const requestId = crypto.randomUUID()
      const startedAt = performance.now()
      window.canvasBridge.logDiagnostic('dock-launch-dispatched', {
        requestId,
        widgetId: widget.id,
        itemId: item.id,
        itemName: item.name,
        variant,
      })
      const launch = () => {
        void window.canvasBridge.launchDesktopIcon(widget.id, item, requestId).then((result) => {
          window.canvasBridge.logDiagnostic('dock-launch-result', {
            requestId,
            widgetId: widget.id,
            itemId: item.id,
            ok: result.ok,
            method: result.method ?? null,
            activatedExisting: result.activatedExisting ?? false,
            error: result.error ?? null,
            elapsedMs: Math.round(performance.now() - startedAt),
          })
          if (!result.ok && result.error) console.warn('[desktop-icons] launch failed:', result.error)
        }).catch((error) => {
          window.canvasBridge.logDiagnostic('dock-launch-rejected', {
            requestId,
            widgetId: widget.id,
            itemId: item.id,
            error: error instanceof Error ? error.message : String(error),
            elapsedMs: Math.round(performance.now() - startedAt),
          })
        })
      }
      if (variant === 'dock') {
        setBouncingId(item.id)
        launch()
        window.setTimeout(() => setBouncingId(null), DOCK_BOUNCE_RESET_MS)
      } else {
        setBouncingId(item.id)
        launch()
        window.setTimeout(() => setBouncingId(null), 500)
      }
    },
    [editing, variant, widget.id]
  )

  const requestActivateItem = useCallback(
    (item: DesktopIconItem) => {
      const now = Date.now()
      const suppressed = suppressActivationRef.current
      if (suppressed && suppressed.id === item.id && now <= suppressed.until) {
        window.canvasBridge.logDiagnostic('dock-launch-suppressed', {
          widgetId: widget.id,
          itemId: item.id,
          reason: 'post-drag',
          remainingMs: suppressed.until - now,
        })
        return
      }

      const lastActivation = lastActivationRef.current
      if (lastActivation?.id === item.id && now - lastActivation.at < 350) {
        window.canvasBridge.logDiagnostic('dock-launch-suppressed', {
          widgetId: widget.id,
          itemId: item.id,
          reason: 'debounce',
          elapsedMs: now - lastActivation.at,
        })
        return
      }

      lastActivationRef.current = { id: item.id, at: now }
      activateItem(item)
    },
    [activateItem, widget.id]
  )

  const handleItemClick = useCallback(
    (item: DesktopIconItem) => {
      if (variant === 'dock') {
        requestActivateItem(item)
        return
      }

      const now = Date.now()
      const lastClick = lastClickRef.current
      if (lastClick?.id === item.id && now - lastClick.at <= DOUBLE_CLICK_MS) {
        lastClickRef.current = null
        requestActivateItem(item)
      } else {
        lastClickRef.current = { id: item.id, at: now }
      }
    },
    [requestActivateItem, variant]
  )

  const activateDockSystemAction = useCallback(
    (action: DockSystemActionId) => {
      if (editing) return
      if (action === 'settings') {
        void window.canvasBridge.openSettings()
      } else if (action === 'explorer') {
        void window.canvasBridge.openExplorer()
      } else if (action === 'recycle-bin') {
        void window.canvasBridge.openRecycleBin()
      } else {
        void window.canvasBridge.showDesktop()
      }
    },
    [editing]
  )

  const handleIconContextMenu = useCallback(
    (item: DesktopIconItem, event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (editing) return
      void window.canvasBridge.showDesktopIconContextMenu(widget.id, item).then((result) => {
        if (result && !result.ok && result.error) console.warn('[desktop-icons] context menu action failed:', result.error)
      })
    },
    [editing, widget.id]
  )

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      dropDepthRef.current = 0
      setDropActive(false)

      const filePaths = Array.from(event.dataTransfer.files)
        .map((file) => window.canvasBridge.getFilePath(file))
        .filter((filePath): filePath is string => Boolean(filePath))
      if (filePaths.length === 0) return

      const result = await window.canvasBridge.importDesktopIcons(widget.id, filePaths)
      if (!result.ok && result.error) console.warn('[desktop-icons] import failed:', result.error)
      if (result.skipped?.length) console.warn('[desktop-icons] import skipped:', result.skipped)
    },
    [widget.id]
  )

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dropDepthRef.current += 1
    setDropActive(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1)
    if (dropDepthRef.current === 0) setDropActive(false)
  }, [])

  const handleIconPointerDown = useCallback(
    (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => {
      if (editing) return
      if (event.button !== 0) return
      event.stopPropagation()
      if (resizing) return
      event.currentTarget.setPointerCapture(event.pointerId)
      window.canvasBridge.logDiagnostic('dock-icon-pointer-down', {
        widgetId: widget.id,
        itemId: item.id,
        pointerId: event.pointerId,
        variant,
      })
      const currentItems = variant === 'dock' ? dockItems : renderedItems
      const nextDrag: DragState = {
        id: item.id,
        variant,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        active: false,
        cancelled: false,
        longPressTimer: null,
        currentItems,
      }
      nextDrag.longPressTimer = window.setTimeout(() => {
        const drag = dragRef.current
        if (!drag || drag.id !== item.id || drag.cancelled || drag.active) return
        drag.longPressTimer = null
        drag.active = true
        setDraggingId(item.id)
        setDraft(drag.currentItems)
      }, LONG_PRESS_REORDER_MS)
      dragRef.current = nextDrag
    },
    [dockItems, editing, renderedItems, resizing, setDraft, variant, widget.id]
  )

  const handleIconPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag) return
      event.preventDefault()
      event.stopPropagation()
      const deltaX = event.clientX - drag.startClientX
      const deltaY = event.clientY - drag.startClientY
      if (!drag.active) {
        if (Math.abs(deltaX) > POINTER_CANCEL_PX || Math.abs(deltaY) > POINTER_CANCEL_PX) {
          drag.moved = true
          drag.cancelled = true
          clearDragTimer(drag)
        }
        return
      }

      if (Math.abs(deltaX) > DRAG_MOVE_PX || Math.abs(deltaY) > DRAG_MOVE_PX) drag.moved = true

      updateDraft((currentItems) => {
        const baseItems = currentItems ?? drag.currentItems
        const currentIndex = baseItems.findIndex((candidate) => candidate.id === drag.id)
        if (currentIndex < 0) return baseItems
        const targetIndex = getTargetIndexForVariant(
          drag.variant,
          event.clientX,
          event.clientY,
          containerRef.current?.getBoundingClientRect(),
          scrollRef.current,
          storageLayout,
          storageMetrics,
          baseItems.length
        )
        if (targetIndex === currentIndex) return baseItems
        return moveItem(baseItems, currentIndex, targetIndex)
      })
    },
    [storageLayout, storageMetrics, updateDraft]
  )

  const handleIconPointerUp = useCallback(
    async (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      event.stopPropagation()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (!drag) return
      clearDragTimer(drag)

      const finalDraft = draftItemsRef.current ?? drag.currentItems
      dragRef.current = null
      setDraggingId(null)
      setDraft(null)

      if (!drag.active) {
        window.canvasBridge.logDiagnostic('dock-icon-pointer-up', {
          widgetId: widget.id,
          itemId: item.id,
          pointerId: event.pointerId,
          active: false,
          cancelled: drag.cancelled,
          moved: drag.moved,
          willActivate: !drag.cancelled && !drag.moved && drag.variant === 'dock',
        })
        if (!drag.cancelled && !drag.moved) {
          handleItemClick(finalDraft.find((candidate) => candidate.id === item.id) ?? item)
        }
        return
      }

      window.canvasBridge.logDiagnostic('dock-icon-pointer-up', {
        widgetId: widget.id,
        itemId: item.id,
        pointerId: event.pointerId,
        active: true,
        cancelled: drag.cancelled,
        moved: drag.moved,
        willActivate: false,
      })
      if (!drag.moved) return
      await saveItems(finalDraft)
      suppressActivationRef.current = { id: item.id, until: Date.now() + 520 }
    },
    [handleItemClick, saveItems, setDraft, widget.id]
  )

  const handleIconPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (!drag) return
      clearDragTimer(drag)
      dragRef.current = null
      setDraggingId(null)
      setDraft(null)
    },
    [setDraft]
  )

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!scrollRef.current) return
      if (variant === 'horizontal') {
        scrollRef.current.scrollLeft += event.deltaY || event.deltaX
      } else if (variant === 'vertical') {
        scrollRef.current.scrollTop += event.deltaY
      } else {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [variant]
  )

  const glassStyle = variant === 'dock' ? dockStyle() : storageStyle(dropActive, storageAppearance)
  const glassOverlay = makeStorageOverlay(storageAppearance)
  const glassBlur = storageAppearance?.blurPx ?? STORAGE_DEFAULT_BLUR

  return (
    <div
      ref={containerRef}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={glassStyle}
    >
      {variant === 'dock' && dockAppearance ? (
        <DockGlassBackground appearance={dockAppearance} active={dropActive} flipped={dockFlipped} />
      ) : (
        <FrostedGlassBackground
          blurPx={glassBlur}
          overlayColor={glassOverlay}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {variant === 'dock' ? (
          <IconDockSurface
            key={`dock-${interactionEpoch}`}
            items={dockItems}
            height={containerSize.height}
            hoverIndex={hoverIndex}
            appearance={dockAppearance ?? readDockAppearance(widget.config)}
            disableMagnify={editing}
            interactionDisabled={editing}
            flipped={dockFlipped}
            draggingId={draggingId}
            bouncingId={bouncingId}
            onHoverIndex={setHoverIndex}
            onPointerDown={handleIconPointerDown}
            onPointerMove={handleIconPointerMove}
            onPointerUp={handleIconPointerUp}
            onPointerCancel={handleIconPointerCancel}
            onContextMenu={handleIconContextMenu}
            onActivate={requestActivateItem}
            onSystemAction={activateDockSystemAction}
          />
        ) : (
          <>
            {storageAppearance?.chromeStyle === 'titled' && <StorageTitleBar title={storageAppearance.title} />}
            <StorageSurface
              key={`storage-${interactionEpoch}`}
              refEl={scrollRef}
              variant={variant}
              topInset={titleHeight}
              layout={storageLayout ?? createStorageLayout([], variant, containerSize.width, storageContentHeight, storageMetrics)}
              metrics={storageMetrics}
              draggingId={draggingId}
              bouncingId={bouncingId}
              interactionDisabled={editing}
              hideLabels={storageHideLabels}
              onHoverItemId={setHoveredStorageId}
              onWheel={handleWheel}
              onPointerDown={handleIconPointerDown}
              onPointerMove={handleIconPointerMove}
              onPointerUp={handleIconPointerUp}
              onPointerCancel={handleIconPointerCancel}
              onContextMenu={handleIconContextMenu}
              onItemClick={handleItemClick}
              onActivate={requestActivateItem}
            />
            {storageHideLabels && hoveredStorageId && !draggingId && storageLayout && (
              <StorageHoverLabel
                item={storageLayout.items.find((entry) => entry.item.id === hoveredStorageId) ?? null}
                topInset={titleHeight}
                scrollElement={scrollRef.current}
                metrics={storageMetrics}
              />
            )}
          </>
        )}
        {renderedItems.length === 0 && variant !== 'dock' && <EmptyDropMark variant={variant} topInset={titleHeight} />}
      </div>
    </div>
  )
}

function StorageSurface({
  refEl,
  variant,
  topInset,
  layout,
  metrics,
  draggingId,
  bouncingId,
  interactionDisabled,
  hideLabels,
  onHoverItemId,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onItemClick,
  onActivate,
}: {
  refEl: React.RefObject<HTMLDivElement | null>
  variant: StorageVariant
  topInset: number
  layout: StorageLayout
  metrics: StorageMetrics
  draggingId: string | null
  bouncingId: string | null
  interactionDisabled: boolean
  hideLabels: boolean
  onHoverItemId: (id: string | null) => void
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  onPointerDown: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  onContextMenu: (item: DesktopIconItem, event: React.MouseEvent<HTMLElement>) => void
  onItemClick: (item: DesktopIconItem) => void
  onActivate: (item: DesktopIconItem) => void
}) {
  return (
    <div
      ref={refEl}
      onWheel={onWheel}
      className="desktop-icon-storage-scroll"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: topInset,
        bottom: 0,
        overflowX: variant === 'horizontal' ? 'auto' : 'hidden',
        overflowY: variant === 'vertical' ? 'auto' : 'hidden',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        pointerEvents: interactionDisabled ? 'none' : 'auto',
      }}
    >
      <style>{'.desktop-icon-storage-scroll::-webkit-scrollbar{display:none}'}</style>
      <div
        style={{
          position: 'relative',
          width: variant === 'horizontal' ? layout.contentWidth : '100%',
          height: variant === 'horizontal' ? '100%' : layout.contentHeight,
          minWidth: '100%',
          minHeight: '100%',
        }}
      >
        <AnimatePresence initial={false}>
          {layout.items.map(({ item, x, y }) => (
            <motion.button
              key={item.id}
              type="button"
              data-desktop-icon-action
              aria-label={item.name}
              onMouseEnter={() => onHoverItemId(item.id)}
              onMouseLeave={() => onHoverItemId(null)}
              onPointerDown={(event) => onPointerDown(item, event)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => {
                onHoverItemId(null)
                onPointerUp(item, event)
              }}
              onPointerCancel={(event) => {
                onHoverItemId(null)
                onPointerCancel(event)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                event.stopPropagation()
                onActivate(item)
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.detail !== 0 || event.currentTarget.dataset.nativeIconClick !== 'true') return
                onItemClick(item)
              }}
              onContextMenu={(event) => onContextMenu(item, event)}
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{
                opacity: 1,
                scale: bouncingId === item.id ? [1, 0.82, 1.06, 1] : draggingId === item.id ? 1.08 : 1,
                left: x,
                top: y,
              }}
              exit={{ opacity: 0, scale: 0.82 }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 32,
                scale: bouncingId === item.id ? { duration: 0.38, ease: [0.28, 0, 0.42, 1] } : undefined,
              }}
              style={{
                ...iconButtonBase,
                position: 'absolute',
                width: metrics.cellWidth,
                height: metrics.cellHeight,
                justifyContent: hideLabels ? 'center' : 'flex-start',
              }}
            >
              <IconImage item={item} size={metrics.iconSize} />
              {!hideLabels && <IconLabel name={item.name} fontSize={metrics.labelFontSize} marginTop={metrics.labelMarginTop} />}
            </motion.button>
          ))}
        </AnimatePresence>
        {/* 启动叠加放大淡出效果 */}
        <AnimatePresence>
          {bouncingId &&
            layout.items.find((entry) => entry.item.id === bouncingId) &&
            ((bounceEntry) => (
              <motion.span
                key={`launch-overlay-${bounceEntry.item.id}`}
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 2.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.48, delay: 0.15, ease: [0.22, 0, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  left: bounceEntry.x + (metrics.cellWidth - metrics.iconSize) / 2,
                  top: bounceEntry.y + (hideLabels ? (metrics.cellHeight - metrics.iconSize) / 2 : 8),
                  width: metrics.iconSize,
                  height: metrics.iconSize,
                  zIndex: 20,
                  pointerEvents: 'none',
                  transformOrigin: 'center center',
                }}
              >
                <IconImage item={bounceEntry.item} size={metrics.iconSize} fluid />
              </motion.span>
            ))(layout.items.find((entry) => entry.item.id === bouncingId)!)}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StorageHoverLabel({
  item,
  topInset,
  scrollElement,
  metrics,
}: {
  item: PositionedIcon | null
  topInset: number
  scrollElement: HTMLDivElement | null
  metrics: StorageMetrics
}) {
  if (!item) return null
  const left = item.x + metrics.cellWidth / 2 - (scrollElement?.scrollLeft ?? 0)
  const top = topInset + item.y + (metrics.cellHeight - metrics.iconSize) / 2 - (scrollElement?.scrollTop ?? 0) - 8
  return (
    <motion.span
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.14 }}
      style={{
        ...glassTipStyle,
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, -100%)',
        zIndex: 8,
      }}
    >
      {item.item.name}
    </motion.span>
  )
}

function StorageTitleBar({ title }: { title: string }) {
  return (
    <div
      data-widget-drag-handle
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: STORAGE_TITLE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        cursor: 'grab',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.055))',
        borderBottom: '1px solid rgba(255,255,255,0.16)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        pointerEvents: 'auto',
        zIndex: 2,
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1,
          textShadow: '0 1px 4px rgba(0,0,0,0.32)',
          letterSpacing: 0,
          pointerEvents: 'none',
        }}
      >
        {title || '图标收纳'}
      </span>
    </div>
  )
}

function IconDockSurface({
  items,
  height,
  hoverIndex,
  appearance,
  disableMagnify,
  interactionDisabled,
  flipped,
  draggingId,
  bouncingId,
  onHoverIndex,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onActivate,
  onSystemAction,
}: {
  items: DesktopIconItem[]
  height: number
  hoverIndex: number | null
  appearance: DockAppearance
  disableMagnify: boolean
  interactionDisabled: boolean
  flipped: boolean
  draggingId: string | null
  bouncingId: string | null
  onHoverIndex: (index: number | null) => void
  onPointerDown: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  onContextMenu: (item: DesktopIconItem, event: React.MouseEvent<HTMLElement>) => void
  onActivate: (item: DesktopIconItem) => void
  onSystemAction: (action: DockSystemActionId) => void
}) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const iconSize = getDockIconSize(height)

  useEffect(() => {
    if (disableMagnify) mouseX.set(Number.POSITIVE_INFINITY)
  }, [disableMagnify, mouseX])

  return (
    <div
      onMouseMove={(event) => {
        if (!disableMagnify) mouseX.set(event.clientX)
      }}
      onMouseLeave={() => {
        mouseX.set(Number.POSITIVE_INFINITY)
        onHoverIndex(null)
      }}
      style={{
        position: 'absolute',
        inset: '6px 12px 7px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: DOCK_GAP,
        overflow: 'visible',
        pointerEvents: interactionDisabled ? 'none' : 'auto',
      }}
    >
      {DOCK_SYSTEM_ACTIONS.map((action) => (
        <DockSystemButton
          key={action.id}
          action={action}
          mouseX={mouseX}
          iconSize={iconSize}
          hoverScale={disableMagnify ? 1 : appearance.hoverScale}
          showReflection={appearance.showReflection}
          flipped={flipped}
          onAction={onSystemAction}
        />
      ))}
      {items.length > 0 && (
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: Math.max(26, iconSize * 0.74),
            borderRadius: 999,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.58), transparent)',
            boxShadow: '1px 0 0 rgba(15,23,42,0.12)',
            flex: '0 0 auto',
          }}
        />
      )}
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <DockIconButton
            key={item.id}
            item={item}
            index={index}
            mouseX={mouseX}
            iconSize={iconSize}
            hovered={hoverIndex === index}
            showReflection={appearance.showReflection}
            hoverScale={disableMagnify ? 1 : appearance.hoverScale}
            flipped={flipped}
            dragging={draggingId === item.id}
            bouncing={bouncingId === item.id}
            onHoverIndex={onHoverIndex}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={onContextMenu}
            onActivate={onActivate}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

function DockSystemButton({
  action,
  mouseX,
  iconSize,
  hoverScale,
  showReflection,
  flipped,
  onAction,
}: {
  action: (typeof DOCK_SYSTEM_ACTIONS)[number]
  mouseX: MotionValue<number>
  iconSize: number
  hoverScale: number
  showReflection: boolean
  flipped: boolean
  onAction: (action: DockSystemActionId) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [bouncing, setBouncing] = useState(false)
  const distance = useTransform(mouseX, (value) => {
    if (!Number.isFinite(value)) return 9999
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return 9999
    return value - (rect.left + rect.width / 2)
  })
  const rawScale = useTransform(
    distance,
    [-180, -112, -48, 0, 48, 112, 180],
    [
      1,
      1 + (hoverScale - 1) * 0.12,
      1 + (hoverScale - 1) * 0.55,
      hoverScale,
      1 + (hoverScale - 1) * 0.55,
      1 + (hoverScale - 1) * 0.12,
      1,
    ]
  )
  const scale = useSpring(rawScale, { stiffness: 210, damping: 20, mass: 0.12 })
  const tooltipDistance = useTransform(scale, (value) => {
    const liftValue = hoverScale <= 1 ? 0 : ((value - 1) / (hoverScale - 1)) * iconSize * 0.24
    return `calc(50% + ${iconSize * (value - 0.5) + liftValue + 8}px)`
  })
  const slotSize = iconSize + DOCK_SLOT_EXTRA
  const hitInsets = getDockInteractionInsets(iconSize, hoverScale)

  const triggerBounce = useCallback(() => {
    setBouncing(true)
    window.setTimeout(() => setBouncing(false), DOCK_BOUNCE_RESET_MS)
  }, [])

  return (
    <motion.button
      ref={ref}
      type="button"
      data-desktop-icon-action
      aria-label={action.label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        triggerBounce()
        onAction(action.id)
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.detail !== 0) return
        triggerBounce()
        onAction(action.id)
      }}
      animate={
        bouncing
          ? { y: getDockBounceKeyframes(flipped) }
          : {}
      }
      transition={{
        y: bouncing
          ? { duration: DOCK_BOUNCE_DURATION_SECONDS, times: DOCK_BOUNCE_TIMES, ease: 'linear' }
          : {},
      }}
      style={{
        ...iconButtonBase,
        width: slotSize,
        height: '100%',
        position: 'relative',
        overflow: 'visible',
        justifyContent: 'center',
        zIndex: hovered ? 5 : 2,
        transformOrigin: flipped ? 'top center' : 'bottom center',
      }}
    >
      <DockInteractionHitArea insets={hitInsets} flipped={flipped} />
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute',
              top: flipped ? tooltipDistance : undefined,
              bottom: flipped ? undefined : tooltipDistance,
              left: '50%',
              x: '-50%',
              ...glassTipStyle,
              zIndex: 9,
            }}
          >
            {action.label}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        style={{
          width: iconSize,
          height: iconSize,
          scale,
          display: 'flex',
          flex: '0 0 auto',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          transformOrigin: flipped ? 'top center' : 'bottom center',
        }}
      >
        <DockSystemIcon action={action.id} size={iconSize} fluid />
        {showReflection && <DockSystemReflection action={action.id} size={iconSize} flipped={flipped} />}
      </motion.span>
    </motion.button>
  )
}

function DockInteractionHitArea({
  insets,
  flipped,
}: {
  insets: { inline: number; liftSide: number; anchorSide: number }
  flipped: boolean
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: -insets.inline,
        right: -insets.inline,
        top: flipped ? -insets.anchorSide : -insets.liftSide,
        bottom: flipped ? -insets.liftSide : -insets.anchorSide,
        zIndex: 0,
        pointerEvents: 'auto',
      }}
    />
  )
}

const DOCK_SYSTEM_ICON_MAP: Record<DockSystemActionId, string> = {
  settings: toRendererPublicUrl('dock-icons/settings.svg'),
  explorer: toRendererPublicUrl('dock-icons/finder.svg'),
  'recycle-bin': toRendererPublicUrl('dock-icons/trash.svg'),
  desktop: toRendererPublicUrl('dock-icons/desktop.svg'),
}

function DockSystemIcon({ action, size, fluid = false }: { action: DockSystemActionId; size: number; fluid?: boolean }) {
  const iconSize = Math.round(size)
  return (
    <span
      style={{
        width: fluid ? '100%' : iconSize,
        height: fluid ? '100%' : iconSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: 'drop-shadow(0 10px 14px rgba(12,18,28,0.22))',
        pointerEvents: 'none',
      }}
    >
      <img
        src={DOCK_SYSTEM_ICON_MAP[action]}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        draggable={false}
      />
    </span>
  )
}

function DockSystemReflection({ action, size, flipped }: { action: DockSystemActionId; size: number; flipped: boolean }) {
  const reflectionMask = flipped
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.54), rgba(0,0,0,0.16) 46%, transparent 100%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.54), rgba(0,0,0,0.16) 46%, transparent 100%)'
  return (
    <span
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: flipped ? undefined : '100%',
        bottom: flipped ? '100%' : undefined,
        width: '100%',
        height: '100%',
        opacity: 0.3,
        transform: 'scaleY(-1)',
        transformOrigin: 'center center',
        filter: 'blur(0.3px) saturate(0.92)',
        maskImage: reflectionMask,
        WebkitMaskImage: reflectionMask,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <DockSystemIcon action={action} size={size} fluid />
    </span>
  )
}

function DockIconButton({
  item,
  index,
  mouseX,
  iconSize,
  hovered,
  showReflection,
  hoverScale,
  flipped,
  dragging,
  bouncing,
  onHoverIndex,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onActivate,
}: {
  item: DesktopIconItem
  index: number
  mouseX: MotionValue<number>
  iconSize: number
  hovered: boolean
  showReflection: boolean
  hoverScale: number
  flipped: boolean
  dragging: boolean
  bouncing: boolean
  onHoverIndex: (index: number | null) => void
  onPointerDown: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (item: DesktopIconItem, event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  onContextMenu: (item: DesktopIconItem, event: React.MouseEvent<HTMLElement>) => void
  onActivate: (item: DesktopIconItem) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const distance = useTransform(mouseX, (value) => {
    if (!Number.isFinite(value)) return 9999
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return 9999
    return value - (rect.left + rect.width / 2)
  })
  const rawScale = useTransform(
    distance,
    [-180, -112, -48, 0, 48, 112, 180],
    [
      1,
      1 + (hoverScale - 1) * 0.12,
      1 + (hoverScale - 1) * 0.55,
      hoverScale,
      1 + (hoverScale - 1) * 0.55,
      1 + (hoverScale - 1) * 0.12,
      1,
    ]
  )
  const scale = useSpring(rawScale, { stiffness: 210, damping: 20, mass: 0.12 })
  const tooltipDistance = useTransform(scale, (value) => {
    const liftValue = hoverScale <= 1 ? 0 : ((value - 1) / (hoverScale - 1)) * iconSize * 0.24
    return `calc(50% + ${iconSize * (value - 0.5) + liftValue + 8}px)`
  })
  const slotSize = iconSize + DOCK_SLOT_EXTRA
  const hitInsets = getDockInteractionInsets(iconSize, hoverScale)

  return (
    <motion.button
      ref={ref}
      type="button"
      data-desktop-icon-action
      layout
      aria-label={item.name}
      onMouseEnter={() => onHoverIndex(index)}
      onPointerDown={(event) => onPointerDown(item, event)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        onPointerUp(item, event)
      }}
      onPointerCancel={(event) => {
        onPointerCancel(event)
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.detail !== 0) return
        onActivate(item)
      }}
      onContextMenu={(event) => onContextMenu(item, event)}
      initial={{ opacity: 0, y: 14, scale: 0.9 }}
      animate={
        bouncing
          ? {
              opacity: 1,
              y: getDockBounceKeyframes(flipped),
              scale: dragging ? 1.08 : 1,
            }
          : { opacity: 1, y: 0, scale: dragging ? 1.08 : 1 }
      }
      exit={{ opacity: 0, y: 12, scale: 0.86 }}
      transition={{
        layout: { type: 'spring', stiffness: 520, damping: 32 },
        scale: { type: 'spring', stiffness: 420, damping: 26 },
        y: bouncing
          ? { duration: DOCK_BOUNCE_DURATION_SECONDS, times: DOCK_BOUNCE_TIMES, ease: 'linear' }
          : { type: 'spring', stiffness: 520, damping: 32 },
      }}
      style={{
        ...iconButtonBase,
        width: slotSize,
        height: '100%',
        justifyContent: 'center',
        transformOrigin: 'bottom center',
        position: 'relative',
        overflow: 'visible',
        zIndex: bouncing || dragging || hovered ? 4 : 1,
      }}
    >
      <DockInteractionHitArea insets={hitInsets} flipped={flipped} />
      <AnimatePresence>
        {hovered && !dragging && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute',
              top: flipped ? tooltipDistance : undefined,
              bottom: flipped ? undefined : tooltipDistance,
              left: '50%',
              x: '-50%',
              ...glassTipStyle,
              zIndex: 8,
            }}
          >
            {item.name}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        style={{
          width: iconSize,
          height: iconSize,
          scale,
          display: 'flex',
          flex: '0 0 auto',
          position: 'relative',
          zIndex: 1,
          transformOrigin: flipped ? 'top center' : 'bottom center',
        }}
      >
        <IconImage item={item} size={iconSize} fluid />
        {showReflection && <DockIconReflection item={item} size={iconSize} flipped={flipped} />}
      </motion.span>
    </motion.button>
  )
}

function IconImage({ item, size, fluid = false }: { item: DesktopIconItem; size: number; fluid?: boolean }) {
  const imageSize = Math.round(size)
  const hasIcon = Boolean(item.iconData)
  return (
    <span
      style={{
        width: fluid ? '100%' : imageSize,
        height: fluid ? '100%' : imageSize,
        borderRadius: Math.max(10, imageSize * 0.22),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hasIcon ? 'transparent' : 'linear-gradient(145deg, rgba(255,255,255,0.42), rgba(255,255,255,0.16))',
        border: hasIcon ? 'none' : '1px solid rgba(255,255,255,0.36)',
        boxShadow: hasIcon ? '0 10px 18px rgba(12,18,28,0.16)' : '0 10px 24px rgba(12,18,28,0.18)',
        overflow: 'hidden',
        flex: '0 0 auto',
      }}
    >
      {item.iconData ? (
        <img
          src={item.iconData}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', imageRendering: 'auto' }}
        />
      ) : item.extension === '.lnk' || item.originalPath.toLowerCase().endsWith('.lnk') ? (
        <AppWindow size={Math.round(imageSize * 0.58)} color="rgba(15,23,42,0.78)" />
      ) : item.isDirectory ? (
        <Folder size={Math.round(imageSize * 0.6)} color="rgba(15,23,42,0.74)" />
      ) : (
        <FileGlyph size={Math.round(imageSize * 0.58)} color="rgba(15,23,42,0.74)" />
      )}
    </span>
  )
}

function DockIconReflection({ item, size, flipped }: { item: DesktopIconItem; size: number; flipped: boolean }) {
  const reflectionMask = flipped
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.62), rgba(0,0,0,0.2) 46%, transparent 100%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0.2) 46%, transparent 100%)'
  return (
    <span
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: flipped ? undefined : '100%',
        bottom: flipped ? '100%' : undefined,
        width: '100%',
        height: '100%',
        opacity: 0.32,
        transform: 'scaleY(-1)',
        transformOrigin: 'center center',
        filter: 'blur(0.3px) saturate(0.92)',
        maskImage: reflectionMask,
        WebkitMaskImage: reflectionMask,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <IconImage item={item} size={size} fluid />
    </span>
  )
}

function IconLabel({ name, fontSize, marginTop }: { name: string; fontSize: number; marginTop: number }) {
  return (
    <span
      style={{
        maxWidth: '100%',
        marginTop,
        color: 'rgba(255,255,255,0.94)',
        fontSize,
        lineHeight: 1.15,
        textAlign: 'center',
        textShadow: '0 1px 3px rgba(0,0,0,0.66)',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
      }}
    >
      {name}
    </span>
  )
}

function EmptyDropMark({ variant, topInset = 0 }: { variant: DesktopIconVariant; topInset?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: topInset,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: 0.55,
      }}
    >
      <span
        style={{
          width: variant === 'dock' ? 38 : 48,
          height: variant === 'dock' ? 38 : 48,
          borderRadius: variant === 'dock' ? 12 : 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.18)',
          border: '1px dashed rgba(255,255,255,0.48)',
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <Plus size={variant === 'dock' ? 20 : 24} />
      </span>
    </div>
  )
}

function DockGlassBackground({
  appearance,
  active,
  flipped,
}: {
  appearance: DockAppearance
  active: boolean
  flipped: boolean
}) {
  const presence = getDockChromePresence(appearance.opacity)
  const isTrapezoid = appearance.chromeStyle === 'trapezoid'
  return (
    <div style={dockChromeStyle(active, appearance, flipped)}>
      <FrostedGlassBackground blurPx={appearance.blurPx} overlayColor={makeDockOverlay(appearance)} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          boxShadow: isTrapezoid
            ? `inset 0 ${flipped ? 1 : -1}px 0 ${alphaColor(appearance.tintColor, appearance.tintStrength * 0.9 * presence)}`
            : `inset 0 1px 0 rgba(255,255,255,${0.22 * presence}), inset 0 -1px 0 ${alphaColor(appearance.tintColor, appearance.tintStrength * 0.9 * presence)}`,
        }}
      />
    </div>
  )
}

const iconButtonBase: CSSProperties = {
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  cursor: 'pointer',
  userSelect: 'none',
  touchAction: 'none',
  outline: 'none',
}

const glassTipStyle: CSSProperties = {
  maxWidth: 148,
  padding: '5px 9px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.26)',
  background: 'linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12))',
  boxShadow: '0 10px 24px rgba(8,16,28,0.18), inset 0 1px 0 rgba(255,255,255,0.22)',
  backdropFilter: 'blur(14px) saturate(1.16)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.16)',
  color: 'rgba(255,255,255,0.96)',
  fontSize: 11,
  fontWeight: 650,
  lineHeight: 1.1,
  textShadow: '0 1px 3px rgba(0,0,0,0.48)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  pointerEvents: 'none',
}

function storageStyle(active: boolean, appearance: StorageAppearance | null): CSSProperties {
  const opacity = appearance?.opacity ?? STORAGE_DEFAULT_OPACITY
  const tintColor = appearance?.tintColor ?? STORAGE_DEFAULT_TINT
  const tintStrength = appearance?.tintStrength ?? STORAGE_DEFAULT_TINT_STRENGTH
  const borderRadius = appearance?.chromeStyle === 'titled' ? STORAGE_TITLED_RADIUS : STORAGE_PLAIN_RADIUS
  return {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius,
    overflow: 'hidden',
    border: active ? '1px solid rgba(125,211,252,0.62)' : `1px solid ${alphaColor(tintColor, Math.max(0.12, tintStrength + 0.12))}`,
    boxShadow: `0 20px 58px rgba(8,16,28,0.18), inset 0 1px 0 rgba(255,255,255,0.24), inset 0 0 0 999px ${alphaColor(tintColor, tintStrength * 0.18)}`,
    background: alphaColor('#ffffff', Math.max(0.02, opacity * 0.55)),
  }
}

function dockStyle(): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'visible',
  }
}

function dockChromeStyle(active: boolean, appearance: DockAppearance, flipped: boolean): CSSProperties {
  const isTrapezoid = appearance.chromeStyle === 'trapezoid'
  const presence = getDockChromePresence(appearance.opacity)
  return {
    position: 'absolute',
    inset: isTrapezoid ? (flipped ? '0 0 auto' : 'auto 0 0') : 0,
    height: isTrapezoid ? '34%' : undefined,
    minHeight: isTrapezoid ? 22 : undefined,
    maxHeight: isTrapezoid ? 30 : undefined,
    zIndex: 0,
    opacity: presence,
    borderRadius: isTrapezoid ? 5 : 20,
    clipPath: isTrapezoid
      ? flipped
        ? 'polygon(0 0, 100% 0, 95% 100%, 5% 100%)'
        : 'polygon(5% 0, 95% 0, 100% 100%, 0 100%)'
      : undefined,
    overflow: 'hidden',
    border: isTrapezoid
      ? active
        ? '1px solid rgba(125,211,252,0.38)'
        : 'none'
      : active
        ? '1px solid rgba(125,211,252,0.62)'
        : `1px solid ${alphaColor(appearance.tintColor, Math.max(0.16, appearance.tintStrength + 0.12))}`,
    boxShadow: isTrapezoid
      ? `0 ${flipped ? -12 : 12}px 26px rgba(8,16,28,0.18), inset 0 ${flipped ? 12 : -12}px 18px ${alphaColor(appearance.tintColor, appearance.tintStrength * 0.5)}`
      : `0 18px 48px rgba(8,16,28,0.17), inset 0 1px 0 rgba(255,255,255,0.23), inset 0 0 0 999px ${alphaColor(appearance.tintColor, appearance.tintStrength * 0.12)}`,
    background: alphaColor('#ffffff', appearance.opacity * 0.72),
    pointerEvents: 'none',
  }
}

function readItems(config?: Record<string, unknown>): DesktopIconItem[] {
  if (!config || !Array.isArray(config.items)) return []
  return config.items.filter(isDesktopIconItem)
}

function readStorageAppearance(config?: Record<string, unknown>): StorageAppearance {
  return {
    tintColor: readStorageTint(config?.storageTint),
    tintStrength: readConfigNumber(config?.storageTintStrength, STORAGE_DEFAULT_TINT_STRENGTH, 0, 0.2),
    opacity: readConfigNumber(config?.storageOpacity, STORAGE_DEFAULT_OPACITY, 0.02, 0.22),
    blurPx: readConfigNumber(config?.storageBlur, STORAGE_DEFAULT_BLUR, 6, 32),
    chromeStyle: config?.storageStyle === 'titled' ? 'titled' : 'plain',
    title: typeof config?.storageTitle === 'string' ? config.storageTitle.slice(0, 32) : '图标收纳',
  }
}

function readDockAppearance(config?: Record<string, unknown>): DockAppearance {
  return {
    tintColor: readStorageTint(config?.dockTint, DOCK_DEFAULT_TINT),
    tintStrength: readConfigNumber(config?.dockTintStrength, DOCK_DEFAULT_TINT_STRENGTH, 0, 0.24),
    opacity: readConfigNumber(config?.dockOpacity, DOCK_DEFAULT_OPACITY, 0, 0.24),
    blurPx: readConfigNumber(config?.dockBlur, DOCK_DEFAULT_BLUR, 6, 32),
    chromeStyle: config?.dockStyle === 'trapezoid' ? 'trapezoid' : 'glass',
    showReflection: config?.dockReflection === true,
    hoverScale: readConfigNumber(config?.dockHoverScale, DOCK_DEFAULT_HOVER_SCALE, 1.1, 2.1),
  }
}

function makeStorageOverlay(appearance: StorageAppearance | null): string {
  if (!appearance) return `rgba(255,255,255,${STORAGE_DEFAULT_OPACITY})`
  return `linear-gradient(145deg, ${alphaColor('#ffffff', appearance.opacity)}, ${alphaColor(appearance.tintColor, appearance.tintStrength)})`
}

function makeDockOverlay(appearance: DockAppearance): string {
  const presence = getDockChromePresence(appearance.opacity)
  if (appearance.chromeStyle === 'trapezoid') {
    return `linear-gradient(to top, ${alphaColor(appearance.tintColor, (appearance.opacity + appearance.tintStrength) * presence)}, ${alphaColor('#ffffff', appearance.opacity * 0.34 * presence)})`
  }
  return `linear-gradient(145deg, ${alphaColor('#ffffff', appearance.opacity * presence)}, ${alphaColor(appearance.tintColor, appearance.tintStrength * presence)})`
}

function getDockChromePresence(opacity: number): number {
  return clampNumber(opacity / DOCK_DEFAULT_OPACITY, 0, 1)
}

function readStorageTint(value: unknown, fallback = STORAGE_DEFAULT_TINT): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback
}

function readConfigNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clampNumber(value, min, max)
}

function alphaColor(color: string, alpha: number): string {
  const rgb = hexToRgb(color) ?? { r: 255, g: 255, b: 255 }
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clampNumber(alpha, 0, 1)})`
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color)
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function isDesktopIconItem(value: unknown): value is DesktopIconItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.originalPath === 'string' &&
    typeof item.managedPath === 'string' &&
    typeof item.removedFromDesktop === 'boolean'
  )
}

function needsMetadataRefresh(item: DesktopIconItem): boolean {
  if (!item.extension) return true
  if (!item.iconData) return true
  if (item.extension === '.lnk' && !item.targetPath) return true
  if (item.extension === '.url' && !item.externalUrl) return true
  return false
}

function orderItems(items: DesktopIconItem[]): DesktopIconItem[] {
  return [...items].sort((first, second) => {
    const orderDelta = (first.order ?? 0) - (second.order ?? 0)
    if (orderDelta !== 0) return orderDelta
    return first.addedAt - second.addedAt
  })
}

function createStorageLayout(
  items: DesktopIconItem[],
  variant: StorageVariant,
  width: number,
  height: number,
  metrics: StorageMetrics,
  forcedColumns?: number,
  forcedRows?: number
): StorageLayout {
  if (variant === 'horizontal') return createHorizontalLayout(items, height, metrics)
  return createVerticalLayout(items, width, height, metrics, forcedColumns, forcedRows)
}

function createVerticalLayout(
  items: DesktopIconItem[],
  width: number,
  height: number,
  metrics: StorageMetrics,
  forcedColumns?: number,
  forcedRows?: number
): StorageLayout {
  const columns = Math.max(1, forcedColumns ?? getColumnCount(width, metrics))
  const rows = Math.max(1, forcedRows ?? Math.ceil(items.length / columns))
  const gridWidth = getGridWidth(columns, metrics)
  const gridHeight = getGridHeight(rows, metrics)
  const contentWidth = Math.max(width, metrics.minWidth)
  const contentHeight = Math.max(height, metrics.minHeight, metrics.padding * 2 + gridHeight)
  const originX = Math.max(metrics.padding, Math.round((contentWidth - gridWidth) / 2))
  const originY = Math.max(metrics.padding, Math.round((contentHeight - gridHeight) / 2))
  const positioned = items.map((item, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      item,
      x: originX + column * (metrics.cellWidth + metrics.gapX),
      y: originY + row * (metrics.cellHeight + metrics.gapY),
    }
  })
  return { items: positioned, contentWidth, contentHeight, columns, rows, originX, originY }
}

function createHorizontalLayout(items: DesktopIconItem[], height: number, metrics: StorageMetrics): StorageLayout {
  const rows = getRowCount(height, metrics)
  const columns = Math.max(1, Math.ceil(items.length / rows))
  const gridWidth = getGridWidth(columns, metrics)
  const gridHeight = getGridHeight(rows, metrics)
  const contentWidth = Math.max(metrics.minWidth, metrics.padding * 2 + gridWidth)
  const contentHeight = Math.max(height, metrics.minHeight)
  const originX = Math.max(metrics.padding, Math.round((contentWidth - gridWidth) / 2))
  const originY = Math.max(metrics.padding, Math.round((contentHeight - gridHeight) / 2))
  const positioned = items.map((item, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      item,
      x: originX + column * (metrics.cellWidth + metrics.gapX),
      y: originY + row * (metrics.cellHeight + metrics.gapY),
    }
  })
  return { items: positioned, contentWidth, contentHeight, columns, rows, originX, originY }
}

function getTargetIndexForVariant(
  variant: DesktopIconVariant,
  clientX: number,
  clientY: number,
  rect: DOMRect | undefined,
  scrollElement: HTMLDivElement | null,
  layout: StorageLayout | null,
  metrics: StorageMetrics,
  length: number
): number {
  if (length <= 1) return 0
  if (!rect) return 0
  if (variant === 'dock') return getDockTargetIndex(clientX, rect, length)
  if (!layout) return 0
  const localX = clientX - rect.left + (scrollElement?.scrollLeft ?? 0)
  const localY = clientY - rect.top + (scrollElement?.scrollTop ?? 0)
  if (variant === 'horizontal') {
    const column = Math.max(0, Math.floor((localX - layout.originX) / (metrics.cellWidth + metrics.gapX)))
    const row = Math.max(0, Math.floor((localY - layout.originY) / (metrics.cellHeight + metrics.gapY)))
    return Math.max(0, Math.min(length - 1, row * layout.columns + column))
  }
  const row = Math.max(0, Math.floor((localY - layout.originY) / (metrics.cellHeight + metrics.gapY)))
  const column = Math.max(0, Math.floor((localX - layout.originX) / (metrics.cellWidth + metrics.gapX)))
  return Math.max(0, Math.min(length - 1, row * layout.columns + column))
}

function getColumnCount(width: number, metrics: StorageMetrics): number {
  return Math.max(
    1,
    Math.floor((Math.max(width, metrics.minWidth) - metrics.padding * 2 + metrics.gapX) / (metrics.cellWidth + metrics.gapX))
  )
}

function getRowCount(height: number, metrics: StorageMetrics): number {
  return Math.max(
    1,
    Math.floor((Math.max(height, metrics.minHeight) - metrics.padding * 2 + metrics.gapY) / (metrics.cellHeight + metrics.gapY))
  )
}

function getStorageWidthForColumns(columns: number, metrics: StorageMetrics): number {
  return metrics.padding * 2 + getGridWidth(columns, metrics)
}

function getStorageHeightForRows(rows: number, metrics: StorageMetrics): number {
  return metrics.padding * 2 + getGridHeight(rows, metrics)
}

function getGridWidth(columns: number, metrics: StorageMetrics): number {
  return columns * metrics.cellWidth + Math.max(0, columns - 1) * metrics.gapX
}

function getGridHeight(rows: number, metrics: StorageMetrics): number {
  return rows * metrics.cellHeight + Math.max(0, rows - 1) * metrics.gapY
}

function getAdaptiveSizing(itemCount: number, manualColumns: number | null, metrics: StorageMetrics): AdaptiveSizing {
  const columns = manualColumns ?? getAdaptiveAutoColumns(itemCount)
  const layoutCount = manualColumns ? Math.max(1, itemCount) : Math.max(4, itemCount)
  const rows = Math.max(1, Math.ceil(layoutCount / columns))
  return {
    columns,
    rows,
    width: getStorageWidthForColumns(columns, metrics),
    height: getStorageHeightForRows(rows, metrics),
  }
}

function getAdaptiveAutoColumns(itemCount: number): number {
  return Math.max(2, Math.ceil(Math.sqrt(Math.max(4, itemCount))))
}

function readAdaptiveManualColumns(config?: Record<string, unknown>): number | null {
  const value = config?.adaptiveManualColumns
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(1, Math.round(value))
}

function readStorageScale(config?: Record<string, unknown>): number {
  const value = config?.iconScale
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return clampNumber(value, STORAGE_SCALE_MIN, STORAGE_SCALE_MAX)
}

function createStorageMetrics(scale: number, hideLabels = false): StorageMetrics {
  const safeScale = clampNumber(scale, STORAGE_SCALE_MIN, STORAGE_SCALE_MAX)
  const cellWidth = scaledMetric(CELL_WIDTH, safeScale)
  const cellHeight = scaledMetric(hideLabels ? CELL_HEIGHT_COMPACT : CELL_HEIGHT, safeScale)
  const gapX = scaledMetric(STORAGE_GAP_X, safeScale)
  const gapY = scaledMetric(hideLabels ? STORAGE_GAP_Y_COMPACT : STORAGE_GAP_Y, safeScale)
  const padding = Math.max(12, scaledMetric(STORAGE_PADDING, safeScale))
  return {
    scale: safeScale,
    cellWidth,
    cellHeight,
    iconSize: scaledMetric(ICON_SIZE, safeScale),
    gapX,
    gapY,
    padding,
    minWidth: padding * 2 + cellWidth,
    minHeight: padding * 2 + cellHeight,
    labelFontSize: clampNumber(Math.round(12 * safeScale), 10, 16),
    labelMarginTop: clampNumber(Math.round(7 * safeScale), 4, 12),
  }
}

function scaledMetric(value: number, scale: number): number {
  return Math.max(1, Math.round(value * scale))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getDockTargetIndex(clientX: number, rect: DOMRect, length: number): number {
  if (length <= 1) return 0
  const iconSize = getDockIconSize(rect.height + 13)
  const slotSize = iconSize + DOCK_SLOT_EXTRA
  const systemWidth = DOCK_SYSTEM_ACTIONS.length * slotSize
  const userWidth = length * slotSize + Math.max(0, length - 1) * DOCK_GAP
  const totalChildCount = DOCK_SYSTEM_ACTIONS.length + 1 + length
  const totalWidth = systemWidth + 1 + userWidth + Math.max(0, totalChildCount - 1) * DOCK_GAP
  const userStart = rect.left + Math.max(0, (rect.width - totalWidth) / 2) + systemWidth + 1 + (DOCK_SYSTEM_ACTIONS.length + 1) * DOCK_GAP
  const ratio = Math.max(0, Math.min(0.999, (clientX - userStart) / Math.max(1, userWidth)))
  return Math.max(0, Math.min(length - 1, Math.floor(ratio * length)))
}

function getDockIconSize(height: number): number {
  return Math.max(ICON_SIZE, Math.min(56, height - 34))
}

function getDockInteractionInsets(iconSize: number, hoverScale: number): { inline: number; liftSide: number; anchorSide: number } {
  const inlineOverflow = Math.max(0, iconSize * hoverScale - (iconSize + DOCK_SLOT_EXTRA)) / 2
  const scaleOverflow = Math.max(0, hoverScale - 1) * iconSize
  return {
    inline: Math.ceil(Math.max(8, inlineOverflow + 4)),
    liftSide: Math.ceil(Math.max(14, scaleOverflow + 6)),
    anchorSide: 8,
  }
}

function getDockPreferredWidth(itemCount: number, height: number, chromeStyle: DockChromeStyle = 'glass', keepEmptyWidth = false): number {
  const iconSize = getDockIconSize(height)
  const visibleCount = Math.max(1, itemCount)
  const contentWidth = visibleCount * (iconSize + DOCK_SLOT_EXTRA) + Math.max(0, itemCount - 1) * DOCK_GAP
  const trapezoidExtra = chromeStyle === 'trapezoid' ? DOCK_TRAPEZOID_SIDE_EXTRA * 2 : 0
  const contentDesiredWidth = Math.ceil(contentWidth + DOCK_HORIZONTAL_INSET * 2 + trapezoidExtra)
  const desiredWidth = keepEmptyWidth ? Math.max(DOCK_EMPTY_WIDTH + trapezoidExtra, contentDesiredWidth) : contentDesiredWidth
  const maxWidth = Math.max(DOCK_MIN_WIDTH, window.innerWidth - 48)
  return Math.max(DOCK_MIN_WIDTH, Math.min(desiredWidth, maxWidth))
}

function isDockInUpperHalf(yPosition: number, measuredHeight: number): boolean {
  const height = Math.max(1, measuredHeight || 1)
  return yPosition + height / 2 < window.innerHeight / 2
}

function clampWidgetX(xPosition: number, width: number): number {
  const minX = 24
  const maxX = Math.max(minX, window.innerWidth - 24 - width)
  return Math.round(Math.max(minX, Math.min(xPosition, maxX)))
}

function moveItem(items: DesktopIconItem[], fromIndex: number, toIndex: number): DesktopIconItem[] {
  const nextItems = [...items]
  const [moving] = nextItems.splice(fromIndex, 1)
  if (!moving) return items
  nextItems.splice(toIndex, 0, moving)
  return nextItems.map((item, index) => ({ ...item, order: index }))
}

function clearDragTimer(drag: DragState): void {
  if (drag.longPressTimer === null) return
  window.clearTimeout(drag.longPressTimer)
  drag.longPressTimer = null
}
