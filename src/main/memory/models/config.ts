import { store } from '../../store'
import { safeStorage } from 'electron'

export type ModelProvider = 'openai-compatible' | 'google' | 'deepseek'

export interface ModelCapabilities {
  toolCalling?: 'auto' | 'native' | 'disabled'
  reasoning?: boolean
  maxContextTokens?: number
  maxOutputTokens?: number
}

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
  capabilities?: ModelCapabilities
}

export interface ModelSettings {
  profiles: ModelProfile[]
  activeProfileId: string
}

const STORE_KEY = 'modelSettings'
const ENCRYPTED_PREFIX = 'safe:v1:'

function encryptApiKey(apiKey: string): string {
  if (!apiKey || apiKey.startsWith(ENCRYPTED_PREFIX) || !safeStorage.isEncryptionAvailable()) return apiKey
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(apiKey).toString('base64')}`
}

function decryptApiKey(apiKey: string): string {
  if (!apiKey.startsWith(ENCRYPTED_PREFIX)) return apiKey
  try {
    return safeStorage.decryptString(Buffer.from(apiKey.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

function getSettings(): ModelSettings {
  const raw = store.get(STORE_KEY) as ModelSettings
  // 向后兼容：旧 profile 可能没有 provider 字段
  if (raw?.profiles) {
    for (const p of raw.profiles) {
      if (!p.provider) p.provider = 'openai-compatible'
    }
  }
  return {
    ...raw,
    profiles: raw.profiles.map((profile) => ({ ...profile, apiKey: decryptApiKey(profile.apiKey) })),
  }
}

function saveSettings(settings: ModelSettings): void {
  store.set(STORE_KEY, {
    ...settings,
    profiles: settings.profiles.map((profile) => ({ ...profile, apiKey: encryptApiKey(profile.apiKey) })),
  })
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
