/** Keeps the transparent canvas interactive until the current pointer gesture finishes. */
export class CanvasPointerGate {
  private readonly activePointers = new Set<number>()

  begin(pointerId: number): void {
    this.activePointers.add(pointerId)
  }

  end(pointerId: number): void {
    this.activePointers.delete(pointerId)
  }

  reset(): void {
    this.activePointers.clear()
  }

  shouldIgnoreMouse(overWidget: boolean, editing: boolean): boolean {
    if (editing || this.activePointers.size > 0) return false
    return !overWidget
  }
}
