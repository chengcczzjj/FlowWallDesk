import type { WidgetInstance } from './types'
import { DEFAULT_QUIET_HOURS, type QuietHours } from './reminders'

export interface CompanionSettings {
  /** Global shortcut that opens the desktop quick chat. Empty disables it. */
  quickChatShortcut: string
  quietHours: QuietHours
}

export const DEFAULT_QUICK_CHAT_SHORTCUT = 'CommandOrControl+Alt+Space'

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  quickChatShortcut: DEFAULT_QUICK_CHAT_SHORTCUT,
  quietHours: DEFAULT_QUIET_HOURS,
}

export function normalizeCompanionSettings(value: Partial<CompanionSettings> | undefined | null): CompanionSettings {
  const quiet = value?.quietHours
  return {
    quickChatShortcut: typeof value?.quickChatShortcut === 'string' ? value.quickChatShortcut.trim().slice(0, 64) : DEFAULT_QUICK_CHAT_SHORTCUT,
    quietHours: {
      enabled: quiet?.enabled === true,
      start: typeof quiet?.start === 'string' && /^\d{1,2}:\d{2}$/.test(quiet.start) ? quiet.start : DEFAULT_QUIET_HOURS.start,
      end: typeof quiet?.end === 'string' && /^\d{1,2}:\d{2}$/.test(quiet.end) ? quiet.end : DEFAULT_QUIET_HOURS.end,
    },
  }
}

/** A desktop the user asked the companion to remember ("保存成工作模式"). */
export interface DesktopMode {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  wallpaperId: string | null
  wallpaperName?: string
  /** Wallpaper-scoped widgets only; Dock and icon boxes stay global. */
  widgets: WidgetInstance[]
}
