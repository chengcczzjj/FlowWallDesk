export const DOCK_BOUNCE_HEIGHT_PX = 58
export const DOCK_BOUNCE_TRAVEL_MS = 720
export const DOCK_BOUNCE_GROUND_PAUSE_MS = 100
export const DOCK_BOUNCE_CYCLE_MS = DOCK_BOUNCE_TRAVEL_MS + DOCK_BOUNCE_GROUND_PAUSE_MS
export const DOCK_BOUNCE_DURATION_SECONDS = DOCK_BOUNCE_CYCLE_MS / 1_000
export const DOCK_BOUNCE_RESET_MS = DOCK_BOUNCE_CYCLE_MS + 40
export const DOCK_BOUNCE_MIN_VISIBLE_MS = DOCK_BOUNCE_TRAVEL_MS
export const DOCK_BOUNCE_TIMES = [
  0,
  DOCK_BOUNCE_TRAVEL_MS / DOCK_BOUNCE_CYCLE_MS / 2,
  DOCK_BOUNCE_TRAVEL_MS / DOCK_BOUNCE_CYCLE_MS,
  1,
]

export function getDockBounceKeyframes(flipped: boolean): number[] {
  const direction = flipped ? 1 : -1
  const height = direction * DOCK_BOUNCE_HEIGHT_PX
  return [0, height, 0, 0]
}

export function getDockBounceCompletionDelayMs(elapsedMs: number): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  if (elapsed < DOCK_BOUNCE_MIN_VISIBLE_MS) {
    return Math.ceil(DOCK_BOUNCE_MIN_VISIBLE_MS - elapsed)
  }

  const phase = elapsed % DOCK_BOUNCE_CYCLE_MS
  if (phase <= 1 || phase >= DOCK_BOUNCE_TRAVEL_MS) return 0
  return Math.ceil(DOCK_BOUNCE_TRAVEL_MS - phase)
}

export function shouldDockSystemActionBounce(actionId: string): boolean {
  return actionId !== 'desktop'
}
