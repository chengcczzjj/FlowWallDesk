export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_LATEST_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_CONTEXT_TOKENS = 1_000_000
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 384_000

const LEGACY_DEEPSEEK_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner'])

export function normalizeDeepSeekModel(model: string): string {
  return LEGACY_DEEPSEEK_MODELS.has(model.trim().toLowerCase())
    ? DEEPSEEK_LATEST_MODEL
    : model
}

export function normalizeDeepSeekBaseURL(baseURL: string): string {
  const value = baseURL.trim()
  if (!value || /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/i.test(value)) {
    return DEEPSEEK_API_BASE_URL
  }
  return value
}

export function isDeepSeekV4Model(model: string): boolean {
  return /^deepseek-v4-(flash|pro)(?:-|$)/i.test(model.trim())
}
