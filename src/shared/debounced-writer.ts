/** Retain failed writes for retry; serialize writes and drain changes made while saving. */
export function createDebouncedWriter<T>(write: (value: T) => Promise<void>, onError: (error: unknown) => void, delay = 500) {
  let pending: { value: T } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined

  function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    if (running) return running.then(() => pending ? flush() : undefined)
    running = (async () => {
      while (pending) {
        const entry = pending
        await write(entry.value)
        if (pending === entry) pending = undefined
      }
    })().finally(() => { running = undefined })
    return running
  }

  return {
    schedule(value: T): void {
      pending = { value }
      clearTimeout(timer)
      timer = setTimeout(() => { void flush().catch(onError) }, delay)
    },
    flush,
  }
}
