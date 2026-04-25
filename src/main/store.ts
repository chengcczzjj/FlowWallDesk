import Store from 'electron-store'
import type { WallpaperState, WidgetInstance } from '@shared/types'

interface Schema {
  wallpaper: WallpaperState
  widgets: WidgetInstance[]
  /** 主界面窗口最后位置 */
  mainWindowBounds?: { x: number; y: number; width: number; height: number }
}

const defaults: Schema = {
  wallpaper: { volume: 0.5, muted: true },
  widgets: [],
}

export const store = new Store<Schema>({
  name: 'lingyue-config',
  defaults,
})
