import Store from 'electron-store'
import type { WallpaperState, WidgetInstance, ModelProfile, WallpaperDisplayMode } from '@shared/types'
import type { DesktopSceneSnapshot } from '@shared/desktop-scene'

interface ModelSettings {
  profiles: ModelProfile[]
  activeProfileId: string
}

interface PrivacySettings {
  preciseLocationEnabled: boolean
}

interface AppSettings {
  launchAtLogin: boolean
}

interface WallpaperDisplaySettingsStore {
  /** Determines whether wallpaper windows target one monitor, every monitor, or the virtual desktop. */
  mode: WallpaperDisplayMode
  /** display id -> wallpaper id; absent entries fall back to wallpaper.current */
  assignments: Record<string, string>
}

interface Schema {
  wallpaper: WallpaperState
  wallpaperDisplay: WallpaperDisplaySettingsStore
  widgets: WidgetInstance[]
  /** 跨壁纸保存的图标收纳与 Dock 组件 */
  globalIconWidgets?: WidgetInstance[]
  /** AI 桌面编排应用前后的可回滚快照 */
  desktopSceneSnapshots?: DesktopSceneSnapshot[]
  /** 主界面窗口最后位置 */
  mainWindowBounds?: { x: number; y: number; width: number; height: number }
  /** Origin of persisted widget coordinates in virtual desktop DIP space. */
  widgetCoordinateOrigin?: { x: number; y: number }
  /** AI 模型配置 */
  modelSettings: ModelSettings
  /** AI 人设 */
  persona?: { name: string; prompt: string; avatar?: string }
  /** 隐私设置 */
  privacySettings: PrivacySettings
  /** 应用生命周期设置 */
  appSettings: AppSettings
}

const defaults: Schema = {
  wallpaper: { volume: 0.5, muted: true },
  // Per-display is the most useful default. Individual assignments fall back
  // to wallpaper.current until the user chooses a wallpaper for that monitor.
  wallpaperDisplay: { mode: 'per-display', assignments: {} },
  widgets: [],
  modelSettings: {
    profiles: [
      {
        id: 'default',
        name: 'Unimand',
        provider: 'openai-compatible',
        baseURL: 'https://your-api-domain.com/v1',
        apiKey: '',
        model: 'gpt-5.4',
      },
    ],
    activeProfileId: 'default',
  },
  privacySettings: {
    preciseLocationEnabled: false,
  },
  appSettings: {
    launchAtLogin: true,
  },
}

export const store = new Store<Schema>({
  name: 'lingyue-config',
  defaults,
})
