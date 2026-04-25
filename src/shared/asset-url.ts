/** 把主进程返回的绝对路径转换为渲染端可加载的 URL。 */
export function toAssetUrl(absPath?: string): string | undefined {
  if (!absPath) return undefined
  if (/^[a-z]+:\/\//i.test(absPath)) return absPath
  // 使用固定 host 'local' 避免 Chromium 把 Windows 盘符 G: 当作 host 解析
  // 格式: lyasset://local/G:/LingyueDesk/path/to/file
  const normalized = absPath.replace(/\\/g, '/')
  return `lyasset://local/${normalized.split('/').map(encodeURIComponent).join('/')}`
}
