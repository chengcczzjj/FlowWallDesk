import { store } from '../store'

const mutations = new Set<string>()
const reservations = new Map<string, number>()

export function isWallpaperInUse(id: string): boolean {
  return store.get('wallpaper').current?.id === id
    || Object.values(store.get('wallpaperDisplay')?.assignments ?? {}).includes(id)
    || (reservations.get(id) ?? 0) > 0
}

/** Protect resources while an asynchronous display transition is being prepared. */
export function reserveWallpaperUsage(ids: string[]): () => void {
  const unique = [...new Set(ids)]
  if (unique.some((id) => mutations.has(id))) throw new Error('壁纸资源正在更新或删除，请稍后重试。')
  for (const id of unique) reservations.set(id, (reservations.get(id) ?? 0) + 1)
  return () => {
    for (const id of unique) {
      const count = (reservations.get(id) ?? 1) - 1
      if (count) reservations.set(id, count)
      else reservations.delete(id)
    }
  }
}

export function beginWallpaperResourceMutation(id: string): () => void {
  if (isWallpaperInUse(id)) throw new Error('壁纸仍被显示器配置使用，请先切换或清除对应分配。')
  if (mutations.has(id)) throw new Error('壁纸资源正在更新或删除，请稍后重试。')
  mutations.add(id)
  return () => { mutations.delete(id) }
}
