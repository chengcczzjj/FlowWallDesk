const runSignals = new Map<string, AbortSignal>()

export const RunCancellation = {
  register(runId: string, signal?: AbortSignal) {
    if (signal) runSignals.set(runId, signal)
  },

  unregister(runId: string) {
    runSignals.delete(runId)
  },

  getSignal(runId: string): AbortSignal | undefined {
    return runSignals.get(runId)
  },

  isCancelled(runId: string): boolean {
    return runSignals.get(runId)?.aborted ?? false
  },
}