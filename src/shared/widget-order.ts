import type { WidgetInstance } from './types'

export function getWidgetStackOrder(widget: WidgetInstance, fallbackIndex = 0): number {
  return typeof widget.stackOrder === 'number' && Number.isFinite(widget.stackOrder)
    ? widget.stackOrder
    : fallbackIndex
}

/** Add explicit order metadata to legacy records without changing their visual order. */
export function normalizeWidgetStackOrder(widgets: WidgetInstance[]): WidgetInstance[] {
  let changed = false
  const normalized = widgets.map((widget, index) => {
    if (typeof widget.stackOrder === 'number' && Number.isFinite(widget.stackOrder)) return widget
    changed = true
    return { ...widget, stackOrder: index }
  })
  return changed ? normalized : widgets
}

/**
 * Move one widget to the front of the explicit stack without reordering data.
 * Keeping the array stable avoids coupling visual order to wallpaper/global-item
 * merge order and lets React preserve unaffected widget instances.
 */
export function moveWidgetToFront(widgets: WidgetInstance[], widgetId: string): WidgetInstance[] {
  const normalized = normalizeWidgetStackOrder(widgets)
  const target = normalized.find((widget) => widget.id === widgetId)
  if (!target) return widgets
  const maxOrder = normalized.reduce((max, widget, index) => Math.max(max, getWidgetStackOrder(widget, index)), -1)
  if (getWidgetStackOrder(target, normalized.indexOf(target)) >= maxOrder && normalized === widgets) return widgets
  const nextOrder = maxOrder + 1
  return normalized.map((widget) => widget.id === widgetId ? { ...widget, stackOrder: nextOrder } : widget)
}
