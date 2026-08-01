export function toSafeUpdateErrorMessage(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : String(error || '')
  if (/\b404\b/.test(raw)) {
    return '更新服务尚未发布可用版本，请在正式版本发布后重试。'
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|timed?\s*out/i.test(raw)) {
    return '暂时无法连接更新服务，请检查网络后重试。'
  }
  const firstLine = raw.split(/\r?\n/, 1)[0].trim()
  return firstLine ? firstLine.slice(0, 180) : '更新服务暂时不可用，请稍后重试。'
}
