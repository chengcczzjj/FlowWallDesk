import type { WidgetInstance } from './types'

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasBounds {
  x: number
  y: number
  width: number
  height: number
}

export function findInteractiveWidgetAtPoint(
  point: CanvasPoint,
  displayBounds: CanvasBounds,
  widgets: readonly WidgetInstance[],
): WidgetInstance | undefined {
  const clientX = point.x - displayBounds.x
  const clientY = point.y - displayBounds.y

  return widgets.find((widget) => {
    if (widget.enabled === false) return false
    const padding = widget.type === 'desktop-icons-dock' ? 28 : 2
    return (
      clientX >= widget.x - padding &&
      clientX <= widget.x + widget.width + padding &&
      clientY >= widget.y - padding &&
      clientY <= widget.y + widget.height + padding
    )
  })
}

export function shouldIgnoreCanvasMouse(options: {
  desktopOccluded: boolean
  recompositing?: boolean
  editing: boolean
  pointerActive: boolean
  widgetUnderCursor: boolean
}): boolean {
  if (options.desktopOccluded || options.recompositing) return true
  if (options.editing || options.pointerActive || options.widgetUnderCursor) return false
  return true
}
