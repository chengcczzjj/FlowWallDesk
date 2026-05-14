import { store } from '../../store'

export type ModelProvider = 'openai-compatible' | 'google' | 'deepseek'

export interface ModelProfile {
  id: string
  name: string
  provider: ModelProvider
  baseURL: string
  apiKey: string
  model: string
  availableModels?: string[]
  temperature?: number
  maxTokens?: number
  headers?: Record<string, string>
}

export interface ModelSettings {
  profiles: ModelProfile[]
  activeProfileId: string
}

const STORE_KEY = 'modelSettings'

function getSettings(): ModelSettings {
  const raw = store.get(STORE_KEY) as ModelSettings
  // 向后兼容：旧 profile 可能没有 provider 字段
  if (raw?.profiles) {
    for (const p of raw.profiles) {
      if (!p.provider) p.provider = 'openai-compatible'
    }
  }
  return raw
}

function saveSettings(settings: ModelSettings): void {
  store.set(STORE_KEY, settings)
}

export const ModelConfig = {
  /** 获取全部 profile */
  listProfiles(): ModelProfile[] {
    return getSettings().profiles
  },

  /** 获取当前激活的 profile */
  getActive(): ModelProfile | null {
    const s = getSettings()
    return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0] ?? null
  },

  /** 新增或更新 profile */
  upsertProfile(profile: ModelProfile): void {
    const s = getSettings()
    const idx = s.profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) {
      s.profiles[idx] = profile
    } else {
      s.profiles.push(profile)
    }
    if (s.profiles.length === 1) s.activeProfileId = profile.id
    saveSettings(s)
  },

  /** 删除 profile */
  deleteProfile(id: string): void {
    const s = getSettings()
    s.profiles = s.profiles.filter((p) => p.id !== id)
    if (s.activeProfileId === id) {
      s.activeProfileId = s.profiles[0]?.id ?? ''
    }
    saveSettings(s)
  },

  /** 切换激活 profile */
  setActive(id: string): void {
    const s = getSettings()
    if (s.profiles.some((p) => p.id === id)) {
      s.activeProfileId = id
      saveSettings(s)
    }
  },
}
