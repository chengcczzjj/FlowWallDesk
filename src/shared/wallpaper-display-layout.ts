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
  primary: boolean
  bounds: DisplayBounds
}

export type WallpaperObjectFit = 'cover' | 'contain' | 'none' | 'fill' | 'scale-down'

export function normalizeWallpaperDisplayMode(mode: unknown): WallpaperDisplayMode {
  return mode === 'duplicate' || mode === 'per-display' || mode === 'span' || mode === 'primary'
    ? mode
    : 'primary'
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
    for (const display of displays) assignments[String(display.id)] = itemId
    return { mode: 'per-display', assignments, currentId: itemId }
  }
  if (typeof target === 'number') {
    const selectedDisplay = displays.find((display) => display.id === target)
    if (!selectedDisplay) throw new Error('display-not-found')
    if (params.currentId && params.mode !== 'per-display') {
      for (const display of displays) assignments[String(display.id)] = params.currentId
    }
    assignments[String(target)] = itemId
    return {
      mode: 'per-display',
      assignments,
      currentId: !params.currentId || selectedDisplay.primary ? itemId : params.currentId,
    }
  }

  if (params.mode === 'per-display') {
    const primaryId = displays.find((display) => display.primary)?.id
    if (primaryId !== undefined) assignments[String(primaryId)] = itemId
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

/** Non-span modes use one native window per monitor so mixed DPI never distorts monitor boundaries. */
export function getWallpaperWindowTargets(
  mode: WallpaperDisplayMode,
  displays: readonly DisplayDescriptor[],
): WallpaperWindowTarget[] {
  if (displays.length === 0) return []
  if (mode === 'span') {
    return [{ key: 'span', kind: 'span', primary: true, bounds: unionDisplayBounds(displays) }]
  }

  const primary = displays.find((display) => display.primary) ?? displays[0]
  const visible = mode === 'primary' ? [primary] : displays
  return visible.map((display) => ({
    key: `display:${display.id}`,
    kind: 'display',
    displayId: display.id,
    primary: display.primary,
    bounds: { ...display.bounds },
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
        bounds: { ...target.bounds },
        localBounds: { x: 0, y: 0, width: target.bounds.width, height: target.bounds.height },
        item: current,
      }],
    }
  }

  const display = displays.find((candidate) => candidate.id === target.displayId)
  const bounds = display?.bounds ?? target.bounds
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const assignedId = target.displayId === undefined ? undefined : assignments[String(target.displayId)]
  const item = mode === 'per-display' && assignedId ? (byId.get(assignedId) ?? current) : current
  return {
    mode,
    virtualBounds: { ...bounds },
    displays: [{
      displayId: target.displayId ?? -1,
      bounds: { ...bounds },
      localBounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      item,
    }],
  }
}
