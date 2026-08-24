import type { WidgetInstance } from './types'

const DESKTOP_ICON_WIDGET_TYPES = new Set([
  'desktop-icons-box',
  'desktop-icons-horizontal',
  'desktop-icons-adaptive',
  'desktop-icons-dock',
])

// These widgets only paint changing information. They belong to the settled
// desktop layer and should not make the transparent canvas capture the mouse
// or trigger a temporary always-on-top repair during app/window switches.
const PASSIVE_WIDGET_TYPES = new Set([
  'clock',
  'elegantclock',
  'pixelclock',
  'graphicdatetime',
  'audio',
  'weather',
  'text',
  'stocks',
  'news',
  'calendar',
  'pet',
  'sysmonitor',
])

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

export const CANVAS_INTERACTION_REPAIR_DELAY_MS = 140

export function isDesktopIconWidgetType(type: string): boolean {
  return DESKTOP_ICON_WIDGET_TYPES.has(type)
}

export function isPassiveWidgetType(type: string): boolean {
  return PASSIVE_WIDGET_TYPES.has(type)
}

export function isCanvasInteractiveWidgetType(type: string): boolean {
  return !isPassiveWidgetType(type)
}

export function findInteractiveWidgetAtPoint(
  point: CanvasPoint,
  displayBounds: CanvasBounds,
  widgets: readonly WidgetInstance[],
): WidgetInstance | undefined {
  const clientX = point.x - displayBounds.x
  const clientY = point.y - displayBounds.y

  // Widgets render in array order, so the last matching item is visually on top.
  for (let index = widgets.length - 1; index >= 0; index -= 1) {
    const widget = widgets[index]
    if (widget.enabled === false) continue
    const padding = widget.type === 'desktop-icons-dock' ? 28 : 2
    if (
      clientX >= widget.x - padding &&
      clientX <= widget.x + widget.width + padding &&
      clientY >= widget.y - padding &&
      clientY <= widget.y + widget.height + padding
    ) return isCanvasInteractiveWidgetType(widget.type) ? widget : undefined
  }
  return undefined
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

export function shouldRepairCanvasInteraction(options: {
  desktopOccluded: boolean
  recompositing: boolean
  nativeMousePassthrough: boolean | null
  rendererMousePassthrough: boolean
  captureRequestedAt: number
  now: number
  canvasTopmost: boolean
  desktopSurface: boolean
  alreadyAttempted: boolean
}): boolean {
  if (options.desktopOccluded || options.recompositing || options.alreadyAttempted) return false
  if (options.nativeMousePassthrough !== false) return false
  // A renderer hover acknowledgement is normally enough to avoid a repair,
  // but it is not proof that Windows will route the next pointer event to the
  // transparent HWND.  When the native hit surface is the desktop shell we
  // can safely re-enter the compositor even if Chromium currently reports the
  // widget as interactive.
  if (!options.rendererMousePassthrough && !options.desktopSurface) return false
  if (options.captureRequestedAt <= 0 || options.now - options.captureRequestedAt < CANVAS_INTERACTION_REPAIR_DELAY_MS) {
    return false
  }
  // Repair only when the cursor is on our canvas or a desktop shell surface.
  // A normal application covering the same coordinates must never be raised over.
  return options.canvasTopmost || options.desktopSurface
}
