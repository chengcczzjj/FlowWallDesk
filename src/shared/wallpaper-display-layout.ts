import type {
  DisplayBounds,
  DisplayDescriptor,
  WallpaperDisplayLayout,
  WallpaperDisplayMode,
  WallpaperApplyTarget,
  WallpaperItem,
} from './types'

export interface WallpaperWindowTarget {
  key: string
  kind: 'display' | 'span'
  displayId?: number
  displayKey?: string
  primary: boolean
  bounds: DisplayBounds
  nativeBounds?: DisplayBounds
}

export type WallpaperObjectFit = 'cover' | 'contain' | 'none' | 'fill' | 'scale-down'

export function normalizeWallpaperDisplayMode(mode: unknown): WallpaperDisplayMode {
  return mode === 'duplicate' || mode === 'per-display' || mode === 'span' || mode === 'primary'
    ? mode
    : 'primary'
}

export function getDisplayStorageKey(display: Pick<DisplayDescriptor, 'id' | 'key'>): string {
  return display.key || `electron:${display.id}`
}

export function getDisplayAssignment(
  assignments: Readonly<Record<string, string>>,
  display: Pick<DisplayDescriptor, 'id' | 'key'>,
): string | undefined {
  return assignments[getDisplayStorageKey(display)]
    ?? assignments[`electron:${display.id}`]
    ?? assignments[String(display.id)]
}

/** Span always fills the virtual desktop; saved per-wallpaper scaling applies to other modes. */
export function resolveWallpaperObjectFit(
  mode: WallpaperDisplayMode | undefined,
  scaling?: string,
): WallpaperObjectFit {
  if (mode === 'span') return 'cover'

  switch (scaling) {
    case '填充':
      return 'contain'
    case '居中':
      return 'none'
    case '拉伸':
      return 'fill'
    case '自由':
      return 'scale-down'
    default:
      return 'cover'
  }
}

export function planWallpaperApplication(params: {
  target: WallpaperApplyTarget
  mode: WallpaperDisplayMode
  assignments: Readonly<Record<string, string>>
  displays: readonly DisplayDescriptor[]
  currentId?: string
  itemId: string
}): { mode: WallpaperDisplayMode; assignments: Record<string, string>; currentId: string } {
  const { target, displays, itemId } = params
  const assignments = { ...params.assignments }
  if (target === 'all') {
    // Legacy callers may still pass "all".  Treat it as assigning the same
    // wallpaper to every monitor instead of switching to a separate layout
    // mode that is no longer exposed by the UI.
    for (const display of displays) assignments[getDisplayStorageKey(display)] = itemId
    return { mode: 'per-display', assignments, currentId: itemId }
  }
  if (typeof target === 'number') {
    const selectedDisplay = displays.find((display) => display.id === target)
    if (!selectedDisplay) throw new Error('display-not-found')
    if (params.currentId && params.mode !== 'per-display') {
      for (const display of displays) assignments[getDisplayStorageKey(display)] = params.currentId
    }
    assignments[getDisplayStorageKey(selectedDisplay)] = itemId
    return {
      mode: 'per-display',
      assignments,
      currentId: !params.currentId || selectedDisplay.primary ? itemId : params.currentId,
    }
  }

  if (params.mode === 'per-display') {
    const primary = displays.find((display) => display.primary)
    if (primary) assignments[getDisplayStorageKey(primary)] = itemId
  }
  // Applying to the current layout must not silently discard duplicate/span.
  // Only an explicit monitor target changes the layout to per-display.
  return { mode: params.mode, assignments, currentId: itemId }
}

export function unionDisplayBounds(displays: readonly DisplayDescriptor[]): DisplayBounds {
  if (displays.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  const left = Math.min(...displays.map((display) => display.bounds.x))
  const top = Math.min(...displays.map((display) => display.bounds.y))
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height))
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

/** Every mode uses monitor-local native windows; span is cropped from one virtual composition. */
export function getWallpaperWindowTargets(
  mode: WallpaperDisplayMode,
  displays: readonly DisplayDescriptor[],
): WallpaperWindowTarget[] {
  if (displays.length === 0) return []
  const primary = displays.find((display) => display.primary) ?? displays[0]
  const visible = mode === 'primary' ? [primary] : displays
  return visible.map((display) => ({
    key: `display:${getDisplayStorageKey(display)}`,
    kind: 'display',
    displayId: display.id,
    displayKey: getDisplayStorageKey(display),
    primary: display.primary,
    bounds: { ...display.bounds },
    nativeBounds: display.nativeBounds ? { ...display.nativeBounds } : undefined,
  }))
}

export function buildWallpaperLayoutForTarget(params: {
  mode: WallpaperDisplayMode
  target: WallpaperWindowTarget
  displays: readonly DisplayDescriptor[]
  assignments: Readonly<Record<string, string>>
  catalog: readonly WallpaperItem[]
  current: WallpaperItem
}): WallpaperDisplayLayout {
  const { mode, target, displays, assignments, catalog, current } = params
  if (target.kind === 'span') {
    return {
      mode,
      virtualBounds: { ...target.bounds },
      displays: [{
        displayId: -1,
        displayKey: 'span',
        bounds: { ...target.bounds },
        localBounds: { x: 0, y: 0, width: target.bounds.width, height: target.bounds.height },
        item: current,
      }],
    }
  }

  const display = displays.find((candidate) => (
    candidate.key === target.displayKey || candidate.id === target.displayId
  ))
  const bounds = display?.bounds ?? target.bounds
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const assignedId = display ? getDisplayAssignment(assignments, display) : undefined
  const item = mode === 'per-display' && assignedId ? (byId.get(assignedId) ?? current) : current
  const virtualBounds = mode === 'span' ? unionDisplayBounds(displays) : bounds
  return {
    mode,
    virtualBounds: { ...virtualBounds },
    displays: [{
      displayId: target.displayId ?? -1,
      displayKey: target.displayKey ?? `electron:${target.displayId ?? -1}`,
      bounds: { ...bounds },
      localBounds: mode === 'span'
        ? {
            x: virtualBounds.x - bounds.x,
            y: virtualBounds.y - bounds.y,
            width: virtualBounds.width,
            height: virtualBounds.height,
          }
        : { x: 0, y: 0, width: bounds.width, height: bounds.height },
      item,
    }],
  }
}
