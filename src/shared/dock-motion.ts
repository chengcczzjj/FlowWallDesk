export const DOCK_BOUNCE_DURATION_SECONDS = 1.42
export const DOCK_BOUNCE_RESET_MS = 1_500
export const DOCK_BOUNCE_TIMES = [
  0, 0.06, 0.16, 0.24, 0.32, 0.4, 0.47, 0.55, 0.62, 0.69, 0.76, 0.83, 0.89, 0.94, 1,
]

export function getDockBounceKeyframes(flipped: boolean): number[] {
  const direction = flipped ? 1 : -1
  // Ballistic rise/fall followed by two damped contacts.
  return [
    0,
    direction * 22,
    direction * 62,
    direction * 78,
    direction * 68,
    direction * 36,
    0,
    direction * 30,
    direction * 40,
    direction * 29,
    direction * 10,
    0,
    direction * 13,
    direction * 7,
    0,
  ]
}
