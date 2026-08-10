export const DOCK_BOUNCE_DURATION_SECONDS = 0.96
export const DOCK_BOUNCE_RESET_MS = 1_050
export const DOCK_BOUNCE_TIMES = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]

export function getDockBounceKeyframes(flipped: boolean): number[] {
  const direction = flipped ? 1 : -1
  const height = direction * 58
  return [0, height, 0, height, 0, height, 0]
}
