export interface WidgetPlacementRect {
  x: number
  y: number
  width: number
  height: number
  enabled?: boolean
  type?: string
}

export interface WidgetPlacementArea {
  x: number
  y: number
  width: number
  height: number
}

export interface WidgetPlacementOptions {
  gap?: number
  edgePadding?: number
  grid?: number
}

interface Candidate {
  x: number
  y: number
  score: number
}

export function findSmartWidgetPlacement(
  width: number,
  height: number,
  existing: WidgetPlacementRect[],
  area: WidgetPlacementArea,
  options: WidgetPlacementOptions = {},
): { x: number; y: number } {
  const gap = options.gap ?? 16
  const edge = options.edgePadding ?? 24
  const grid = options.grid ?? 16
  const minX = area.x + edge
  const minY = area.y + edge
  const maxX = Math.max(minX, area.x + area.width - edge - width)
  const maxY = Math.max(minY, area.y + area.height - edge - height)
  const active = existing.filter((item) => item.enabled !== false)
  const layoutPeers = active.filter((item) => !item.type?.startsWith('desktop-icons-'))
  const preferredX = maxX
  const preferredY = minY
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  const addCandidate = (rawX: number, rawY: number, priority = 0, strictBounds = false): void => {
    if (strictBounds && (rawX < minX || rawX > maxX || rawY < minY || rawY > maxY)) return
    const x = clamp(snap(rawX, grid), minX, maxX)
    const y = clamp(snap(rawY, grid), minY, maxY)
    const key = `${x}:${y}`
    if (seen.has(key) || overlaps(x, y, width, height, active, gap)) return
    seen.add(key)

    let alignmentBonus = 0
    for (const peer of layoutPeers) {
      if (x === snap(peer.x, grid)) alignmentBonus += 54
      if (y === snap(peer.y, grid)) alignmentBonus += 42
      if (x === snap(peer.x + peer.width + gap, grid) || x + width + gap === snap(peer.x, grid)) {
        alignmentBonus += 90
      }
      if (y === snap(peer.y + peer.height + gap, grid) || y + height + gap === snap(peer.y, grid)) {
        alignmentBonus += 100
      }
    }

    const distance = Math.abs(x - preferredX) + Math.abs(y - preferredY) * 0.82
    candidates.push({ x, y, score: distance - alignmentBonus - priority })
  }

  // Continue the most recently created visual group before opening a new lane.
  const groupPriority = area.width + area.height
  for (const [index, peer] of [...layoutPeers].reverse().entries()) {
    const recencyPriority = Math.max(groupPriority * 0.34, groupPriority - index * area.width * 0.25)
    addCandidate(peer.x, peer.y + peer.height + gap, recencyPriority, true)
    addCandidate(peer.x + peer.width + gap, peer.y, recencyPriority * 0.96, true)
    addCandidate(peer.x - width - gap, peer.y, recencyPriority * 0.9, true)
    addCandidate(peer.x, peer.y - height - gap, recencyPriority * 0.84, true)
  }

  // Empty desktops begin at the upper-right, keeping the usual icon area on the left clear.
  addCandidate(maxX, minY, 110)
  addCandidate(minX, minY, 30)
  addCandidate(maxX, maxY, 10)
  addCandidate(minX, maxY)

  // Combine existing alignment lines so differently sized cards still form clean rows/columns.
  const xs = new Set([minX, maxX, ...layoutPeers.flatMap((peer) => [peer.x, peer.x + peer.width + gap])])
  const ys = new Set([minY, maxY, ...layoutPeers.flatMap((peer) => [peer.y, peer.y + peer.height + gap])])
  for (const y of ys) for (const x of xs) addCandidate(x, y, 45)

  if (candidates.length > 0) {
    candidates.sort((left, right) => left.score - right.score || left.y - right.y || right.x - left.x)
    return { x: candidates[0].x, y: candidates[0].y }
  }

  // Dense desktops fall back to a right-to-left grid scan rather than stacking at (0, 0).
  for (let y = minY; y <= maxY; y += grid) {
    for (let x = maxX; x >= minX; x -= grid) {
      if (!overlaps(x, y, width, height, active, gap)) return { x, y }
    }
  }
  return { x: maxX, y: maxY }
}

function overlaps(
  x: number,
  y: number,
  width: number,
  height: number,
  existing: WidgetPlacementRect[],
  gap: number,
): boolean {
  return existing.some((item) => (
    x < item.x + item.width + gap &&
    x + width + gap > item.x &&
    y < item.y + item.height + gap &&
    y + height + gap > item.y
  ))
}

function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
