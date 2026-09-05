import type { WidgetInstance } from '@shared/types'
import { assertWidgetWriteLimits, parseStoredWidgets } from '@shared/widget-data'
import { normalizeWidgetStackOrder } from '@shared/widget-order'
import { store } from '../store'

const ICON_TYPES = new Set(['desktop-icons-box', 'desktop-icons-horizontal', 'desktop-icons-adaptive', 'desktop-icons-dock'])

export function persistWidgets(widgets: WidgetInstance[], restoring = false): void {
  const normalized = normalizeWidgetStackOrder(parseStoredWidgets(widgets))
  if (!restoring) assertWidgetWriteLimits(normalized, parseStoredWidgets(store.get('widgets')))
  // One electron-store write keeps the runtime and global icon records together.
  store.set({ widgets: normalized, globalIconWidgets: normalized.filter((widget) => ICON_TYPES.has(widget.type)) })
}
