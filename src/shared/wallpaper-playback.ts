/** A common epoch lets independent monitor windows converge on the same video frame. */
export function getSynchronizedVideoTime(epochMs: number, nowMs: number, duration: number, speed: number): number | undefined {
  if (![epochMs, nowMs, duration, speed].every(Number.isFinite) || duration <= 0 || speed <= 0) return undefined
  return Math.max(0, (nowMs - epochMs) / 1000 * speed) % duration
}

export function needsVideoTimeCorrection(actual: number, expected: number, duration: number): boolean {
  const difference = Math.abs(actual - expected)
  return Math.min(difference, Math.abs(duration - difference)) > 0.12
}
