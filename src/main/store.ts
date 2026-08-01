import Store from 'electron-store'
import type { WallpaperState, WidgetInstance, ModelProfile } from '@shared/types'
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

interface Schema {
  wallpaper: WallpaperState
  widgets: WidgetInstance[]
  /** 跨壁纸保存的图标收纳与 Dock 组件 */
  globalIconWidgets?: WidgetInstance[]
  /** AI 桌面编排应用前后的可回滚快照 */
  desktopSceneSnapshots?: DesktopSceneSnapshot[]
  /** 主界面窗口最后位置 */
  mainWindowBounds?: { x: number; y: number; width: number; height: number }
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
