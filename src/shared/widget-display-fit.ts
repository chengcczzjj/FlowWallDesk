/**
 * Display-aware geometry for widgets on the multi-monitor canvas.
 *
 * The transparent canvas covers the union rectangle of every monitor. When
 * monitors differ in size or are offset, parts of that rectangle belong to no
 * monitor at all, and a centred or clamped position computed against the
 * union can straddle a monitor edge or disappear into such a dead zone. All
 * rectangles here share one coordinate space (canvas client pixels).
 */

export interface FitRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FitDisplay {
  bounds: FitRect
  workArea: FitRect
  primary?: boolean
}

export interface FitWidget extends FitRect {
  id: string
  type?: string
  enabled?: boolean
}

/** Minimum part of a widget that must stay on some monitor to be reachable. */
export const WIDGET_MIN_VISIBLE_PX = 42

function intersectionArea(a: FitRect, b: FitRect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

function distanceToRect(x: number, y: number, rect: FitRect): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width))
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

export function getPrimaryFitDisplay<T extends FitDisplay>(displays: readonly T[]): T | undefined {
  return displays.find((display) => display.primary) ?? displays[0]
}

/** The monitor a widget belongs to: the one under its centre, else the one it overlaps most, else the nearest. */
export function pickDisplayForRect<T extends FitDisplay>(rect: FitRect, displays: readonly T[]): T | undefined {
  if (displays.length === 0) return undefined
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const containing = displays.find((display) => distanceToRect(centerX, centerY, display.bounds) === 0)
  if (containing) return containing

  let best: T | undefined
  let bestArea = 0
  for (const display of displays) {
    const overlap = intersectionArea(rect, display.bounds)
    const area = overlap.width * overlap.height
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }
  if (best) return best

  return [...displays].sort((left, right) => (
    distanceToRect(centerX, centerY, left.bounds) - distanceToRect(centerX, centerY, right.bounds)
  ))[0]
}

export function clampRectIntoArea(rect: FitRect, area: FitRect, padding = 0): { x: number; y: number } {
  const minX = area.x + padding
  const minY = area.y + padding
  const maxX = Math.max(minX, area.x + area.width - padding - rect.width)
  const maxY = Math.max(minY, area.y + area.height - padding - rect.height)
  return {
    x: Math.round(Math.max(minX, Math.min(rect.x, maxX))),
    y: Math.round(Math.max(minY, Math.min(rect.y, maxY))),
  }
}

/** Keep at least `visible` pixels of the rectangle on its monitor (free-form sticky notes may hang over the edge). */
export function clampRectPartiallyIntoArea(rect: FitRect, area: FitRect, visible = WIDGET_MIN_VISIBLE_PX): { x: number; y: number } {
  const visibleX = Math.min(visible, rect.width)
  const visibleY = Math.min(visible, rect.height)
  return {
    x: Math.round(Math.max(area.x - rect.width + visibleX, Math.min(rect.x, area.x + area.width - visibleX))),
    y: Math.round(Math.max(area.y - rect.height + visibleY, Math.min(rect.y, area.y + area.height - visibleY))),
  }
}

export function isRectReachable(rect: FitRect, displays: readonly FitDisplay[], visible = WIDGET_MIN_VISIBLE_PX): boolean {
  return displays.some((display) => {
    const overlap = intersectionArea(rect, display.bounds)
    return overlap.width >= Math.min(visible, rect.width) && overlap.height >= Math.min(visible, rect.height)
  })
}

/**
 * Pull widgets that no monitor shows (after switching to primary-only, a
 * monitor being unplugged, or a config authored for a larger screen) back
 * onto the nearest monitor's work area. Reachable widgets are left untouched.
 */
export function fitWidgetsIntoDisplays<T extends FitWidget>(
  widgets: readonly T[],
  displays: readonly FitDisplay[],
  options: { edgePadding?: number; minVisible?: number } = {},
): { widgets: T[]; movedIds: string[] } {
  if (displays.length === 0) return { widgets: [...widgets], movedIds: [] }
  const edgePadding = options.edgePadding ?? 24
  const minVisible = options.minVisible ?? WIDGET_MIN_VISIBLE_PX
  const movedIds: string[] = []
  const next = widgets.map((widget) => {
    if (widget.width <= 0 || widget.height <= 0) return widget
    if (isRectReachable(widget, displays, minVisible)) return widget
    const display = pickDisplayForRect(widget, displays) ?? displays[0]
    const position = clampRectIntoArea(widget, display.workArea, edgePadding)
    if (position.x === widget.x && position.y === widget.y) return widget
    movedIds.push(widget.id)
    return { ...widget, x: position.x, y: position.y }
  })
  return { widgets: next, movedIds }
}

export type FitAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

/** Position a widget at a named spot of a monitor's work area, keeping a consistent margin. */
export function positionAtAnchor(
  anchor: FitAnchor,
  size: { width: number; height: number },
  area: FitRect,
  margin = 32,
): { x: number; y: number } {
  const left = area.x + margin
  const right = area.x + area.width - margin - size.width
  const top = area.y + margin
  const bottom = area.y + area.height - margin - size.height
  const centerX = area.x + (area.width - size.width) / 2
  const centerY = area.y + (area.height - size.height) / 2
  const x = anchor.endsWith('left') ? left : anchor.endsWith('right') ? right : centerX
  const y = anchor.startsWith('top') ? top : anchor.startsWith('bottom') ? bottom : centerY
  return clampRectIntoArea({ x: Math.round(x), y: Math.round(y), ...size }, area, Math.min(margin, 24))
}
