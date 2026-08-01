export interface DesktopRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Only pause the primary desktop when the foreground window actually covers it. */
export function rectCoversDisplay(rect: DesktopRect, bounds: DisplayBounds, tolerancePx = 2): boolean {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return false
  return (
    rect.left <= bounds.x + tolerancePx &&
    rect.top <= bounds.y + tolerancePx &&
    rect.right >= bounds.x + bounds.width - tolerancePx &&
    rect.bottom >= bounds.y + bounds.height - tolerancePx
  )
}

/** Filters transient foreground-window samples without accumulating delayed timers. */
export class StableBooleanTransition {
  private committedValue: boolean
  private candidateValue: boolean | null = null
  private candidateSamples = 0
  private readonly requiredSamples: number

  constructor(initialValue: boolean, requiredSamples = 2) {
    this.committedValue = initialValue
    this.requiredSamples = requiredSamples
  }

  get value(): boolean {
    return this.committedValue
  }

  sample(value: boolean): boolean | null {
    if (value === this.committedValue) {
      this.candidateValue = null
      this.candidateSamples = 0
      return null
    }

    if (this.candidateValue !== value) {
      this.candidateValue = value
      this.candidateSamples = 1
    } else {
      this.candidateSamples += 1
    }

    if (this.candidateSamples < Math.max(1, this.requiredSamples)) return null

    this.committedValue = value
    this.candidateValue = null
    this.candidateSamples = 0
    return value
  }
}
