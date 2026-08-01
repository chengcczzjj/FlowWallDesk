export const GENERATED_WIDGET_THEMES = ['glass', 'solid', 'minimal', 'neon', 'paper'] as const
export type GeneratedWidgetTheme = typeof GENERATED_WIDGET_THEMES[number]

export interface GeneratedWidgetTextBlock {
  type: 'text'
  text: string
  style?: 'body' | 'caption' | 'headline' | 'quote'
  align?: 'left' | 'center' | 'right'
}

export interface GeneratedWidgetMetricBlock {
  type: 'metric'
  label: string
  value: string
  unit?: string
  trend?: string
}

export interface GeneratedWidgetProgressBlock {
  type: 'progress'
  label: string
  value: number
  max?: number
  detail?: string
}

export interface GeneratedWidgetListBlock {
  type: 'list'
  title?: string
  items: Array<{ id: string; text: string; done?: boolean }>
  interactive?: boolean
}

export interface GeneratedWidgetClockBlock {
  type: 'clock'
  format?: 'time' | 'date' | 'datetime'
  locale?: 'zh-CN' | 'en-US'
  showSeconds?: boolean
}

export interface GeneratedWidgetCountdownBlock {
  type: 'countdown'
  label: string
  targetAt: string
  completedText?: string
}

export interface GeneratedWidgetDividerBlock {
  type: 'divider'
}

export type GeneratedWidgetBlock =
  | GeneratedWidgetTextBlock
  | GeneratedWidgetMetricBlock
  | GeneratedWidgetProgressBlock
  | GeneratedWidgetListBlock
  | GeneratedWidgetClockBlock
  | GeneratedWidgetCountdownBlock
  | GeneratedWidgetDividerBlock

export interface GeneratedWidgetDefinition {
  version: 1
  name: string
  title: string
  subtitle?: string
  theme: GeneratedWidgetTheme
  accent: string
  blocks: GeneratedWidgetBlock[]
  generatedAt?: number
}

export function isGeneratedWidgetDefinition(value: unknown): value is GeneratedWidgetDefinition {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (!(record.version === 1 &&
    typeof record.name === 'string' &&
    typeof record.title === 'string' &&
    typeof record.accent === 'string' &&
    (GENERATED_WIDGET_THEMES as readonly unknown[]).includes(record.theme) &&
    Array.isArray(record.blocks) &&
    record.blocks.length > 0 && record.blocks.length <= 12)) return false

  return record.blocks.every((block) => {
    if (!block || typeof block !== 'object') return false
    const item = block as Record<string, unknown>
    if (item.type === 'divider') return true
    if (item.type === 'text') return typeof item.text === 'string'
    if (item.type === 'metric') return typeof item.label === 'string' && typeof item.value === 'string'
    if (item.type === 'progress') return typeof item.label === 'string' && typeof item.value === 'number' && Number.isFinite(item.value)
    if (item.type === 'clock') return true
    if (item.type === 'countdown') return typeof item.label === 'string' && typeof item.targetAt === 'string'
    if (item.type === 'list') {
      return Array.isArray(item.items) && item.items.length > 0 && item.items.length <= 12 && item.items.every((listItem) => {
        if (!listItem || typeof listItem !== 'object') return false
        const listRecord = listItem as Record<string, unknown>
        return typeof listRecord.id === 'string' && typeof listRecord.text === 'string'
      })
    }
    return false
  })
}
