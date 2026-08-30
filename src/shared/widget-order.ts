import type { WidgetInstance } from './types'

/**
 * Canvas siblings render in array order, so the last widget is visually on top.
 * Keep the input array immutable while moving one widget to that front position.
 */
export function moveWidgetToFront(widgets: WidgetInstance[], widgetId: string): WidgetInstance[] {
  const index = widgets.findIndex((widget) => widget.id === widgetId)
  if (index < 0 || index === widgets.length - 1) return widgets
  const target = widgets[index]
  return [...widgets.slice(0, index), ...widgets.slice(index + 1), target]
}
