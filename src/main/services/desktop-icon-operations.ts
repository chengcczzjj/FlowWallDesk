// Moving files and removing their owning widget must not overlap.
const operations = new Map<string, Promise<unknown>>()

export function withDesktopIconOperation<T>(widgetId: string, operation: () => Promise<T>): Promise<T> {
  const previous = operations.get(widgetId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(operation)
  operations.set(widgetId, result)
  void result.finally(() => {
    if (operations.get(widgetId) === result) operations.delete(widgetId)
  }).catch(() => undefined)
  return result
}
