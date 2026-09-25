import type { DisplayBounds, DisplayDescriptor, WallpaperDisplayMode, WidgetInstance } from './types'

export const WIDGET_DISPLAY_COORDINATE_SPACE = 'display-local-v1'

function getStableDisplayKey(display: Pick<DisplayDescriptor, 'id' | 'key'>): string {
  return display.key || `electron:${display.id}`
}

function intersectionArea(left: DisplayBounds, right: DisplayBounds): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

function centerDistanceSquared(rect: DisplayBounds, display: DisplayDescriptor): number {
  const x = rect.x + rect.width / 2 - (display.bounds.x + display.bounds.width / 2)
  const y = rect.y + rect.height / 2 - (display.bounds.y + display.bounds.height / 2)
  return x * x + y * y
}

export function resolveWidgetDisplay(
  widget: Pick<WidgetInstance, 'displayKey' | 'displayId'>,
  displays: readonly DisplayDescriptor[],
): DisplayDescriptor | undefined {
  return displays.find((display) => display.key === widget.displayKey)
    ?? displays.find((display) => display.id === widget.displayId)
}

export function findDisplayForAbsoluteRect(
  rect: DisplayBounds,
  displays: readonly DisplayDescriptor[],
): DisplayDescriptor | undefined {
  return displays
    .map((display) => ({
      display,
      overlap: intersectionArea(rect, display.bounds),
      distance: centerDistanceSquared(rect, display),
    }))
    .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)[0]?.display
}

function bindWidgetToDisplay(
  widget: WidgetInstance,
  display: DisplayDescriptor,
  x: number,
  y: number,
): WidgetInstance {
  return {
    ...widget,
    x,
    y,
    displayId: display.id,
    displayKey: getStableDisplayKey(display),
  }
}

/** Convert a pre-multimonitor canvas coordinate into a stable display-local coordinate. */
export function migrateLegacyWidgetToDisplay(
  widget: WidgetInstance,
  legacyOrigin: Pick<DisplayBounds, 'x' | 'y'>,
  displays: readonly DisplayDescriptor[],
  assumePrimaryLocal = false,
): WidgetInstance {
  const existing = resolveWidgetDisplay(widget, displays)
  if (widget.displayKey) {
    return existing ? bindWidgetToDisplay(widget, existing, widget.x, widget.y) : widget
  }
  const primary = displays.find((display) => display.primary) ?? displays[0]
  if (!primary) return widget
  if (assumePrimaryLocal) return bindWidgetToDisplay(widget, primary, widget.x, widget.y)

  const absoluteRect = {
    x: legacyOrigin.x + widget.x,
    y: legacyOrigin.y + widget.y,
    width: widget.width,
    height: widget.height,
  }
  const display = findDisplayForAbsoluteRect(absoluteRect, displays) ?? primary
  return bindWidgetToDisplay(
    widget,
    display,
    absoluteRect.x - display.bounds.x,
    absoluteRect.y - display.bounds.y,
  )
}

export function materializeWidgetForCanvas(
  widget: WidgetInstance,
  displays: readonly DisplayDescriptor[],
  renderBounds: DisplayBounds,
  mode: WallpaperDisplayMode,
): WidgetInstance | null {
  const primary = displays.find((display) => display.primary) ?? displays[0]
  const display = resolveWidgetDisplay(widget, displays) ?? (!widget.displayKey ? primary : undefined)
  if (!display || (mode === 'primary' && display.id !== primary?.id)) return null
  const area = display.workArea
  const left = area.x - display.bounds.x
  const top = area.y - display.bounds.y
  // Project into the current work area without rewriting saved coordinates;
  // reconnecting a larger display restores the original placement.
  const x = Math.max(left, Math.min(widget.x, left + Math.max(0, area.width - widget.width)))
  const y = Math.max(top, Math.min(widget.y, top + Math.max(0, area.height - widget.height)))
  return bindWidgetToDisplay(
    widget,
    display,
    x + display.bounds.x - renderBounds.x,
    y + display.bounds.y - renderBounds.y,
  )
}

export function materializeWidgetsForCanvas(
  widgets: readonly WidgetInstance[],
  displays: readonly DisplayDescriptor[],
  renderBounds: DisplayBounds,
  mode: WallpaperDisplayMode,
): WidgetInstance[] {
  return widgets.flatMap((widget) => {
    const materialized = materializeWidgetForCanvas(widget, displays, renderBounds, mode)
    return materialized ? [materialized] : []
  })
}

/** Convert a canvas-local drag result back to a display-local persisted record. */
export function persistWidgetFromCanvas(
  widget: WidgetInstance,
  displays: readonly DisplayDescriptor[],
  renderBounds: DisplayBounds,
  mode: WallpaperDisplayMode,
): WidgetInstance {
  const primary = displays.find((display) => display.primary) ?? displays[0]
  const candidates = mode === 'primary' && primary ? [primary] : displays
  const absoluteRect = {
    x: renderBounds.x + widget.x,
    y: renderBounds.y + widget.y,
    width: widget.width,
    height: widget.height,
  }
  const display = findDisplayForAbsoluteRect(absoluteRect, candidates) ?? primary
  if (!display) return widget
  return bindWidgetToDisplay(
    widget,
    display,
    absoluteRect.x - display.bounds.x,
    absoluteRect.y - display.bounds.y,
  )
}

export function getDisplayCanvasBounds(
  display: DisplayDescriptor,
  renderBounds: DisplayBounds,
  useWorkArea = false,
): DisplayBounds {
  const bounds = useWorkArea ? display.workArea : display.bounds
  return {
    x: bounds.x - renderBounds.x,
    y: bounds.y - renderBounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}
