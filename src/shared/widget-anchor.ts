/** Named spots of a monitor's work area the AI companion can place widgets at. */
export const WIDGET_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type WidgetAnchor = (typeof WIDGET_ANCHORS)[number]

interface AnchorRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Position a widget at a named spot of a work area, keeping a consistent
 * margin. Coordinates stay in the area's own space (display-local for stored
 * widgets); oversized widgets stay pinned to the area's top/left edge.
 */
export function positionAtAnchor(
  anchor: WidgetAnchor,
  size: { width: number; height: number },
  area: AnchorRect,
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
  const padding = Math.min(margin, 24)
  const minX = area.x + padding
  const minY = area.y + padding
  const maxX = Math.max(minX, area.x + area.width - padding - size.width)
  const maxY = Math.max(minY, area.y + area.height - padding - size.height)
  return {
    x: Math.round(Math.max(minX, Math.min(x, maxX))),
    y: Math.round(Math.max(minY, Math.min(y, maxY))),
  }
}
