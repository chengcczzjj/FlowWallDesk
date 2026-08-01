/** 把主进程返回的绝对路径转换为渲染端可加载的 URL。 */
export function toAssetUrl(absPath?: string): string | undefined {
  if (!absPath) return undefined
  if (/^[a-z]+:\/\//i.test(absPath)) return absPath
  // 使用固定 host 'local' 避免 Chromium 把 Windows 盘符 G: 当作 host 解析
  // 格式: lyasset://local/G:/LingyueDesk/path/to/file
  const normalized = absPath.replace(/\\/g, '/')
  return `lyasset://local/${normalized.split('/').map(encodeURIComponent).join('/')}`
}

/** Resolve a Vite public asset in both dev HTTP and packaged file:// pages. */
export function toRendererPublicUrl(relativePath: string): string {
  const cleanPath = relativePath.replace(/^\/+/, '')
  return new URL(`../${cleanPath}`, globalThis.location.href).toString()
}

/** Origins used by Lingyue renderer pages in development and packaged builds. */
export function isTrustedRendererAssetOrigin(origin: string | null): boolean {
  if (!origin || origin === 'null' || origin === 'file://') return origin === 'null' || origin === 'file://'
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    )
  } catch {
    return false
  }
}
