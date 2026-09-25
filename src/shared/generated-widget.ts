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

export const GENERATED_WIDGET_MIN_SIZE = { width: 220, height: 120 } as const
export const GENERATED_WIDGET_MAX_SIZE = { width: 760, height: 720 } as const

/** Rough rendered width of a string: CJK glyphs are ~1em, Latin ~0.56em. */
function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) width += /[\u2e80-\uffff]/.test(char) ? fontSize : fontSize * 0.56
  return width
}

function estimateLines(text: string, fontSize: number, contentWidth: number): number {
  return text.split(/\n/).reduce((lines, paragraph) => (
    lines + Math.max(1, Math.ceil(estimateTextWidth(paragraph, fontSize) / Math.max(40, contentWidth)))
  ), 0)
}

/**
 * Height that fits the declared blocks in the GeneratedWidget layout (20px
 * padding, 12px header gap, 10px block gap). A fixed default height either
 * clipped longer cards behind a scrollbar or left short cards half empty.
 */
export function estimateGeneratedWidgetHeight(
  definition: Pick<GeneratedWidgetDefinition, 'subtitle' | 'blocks'>,
  width: number,
): number {
  const contentWidth = Math.max(120, width - 44)
  const header = 21 + (definition.subtitle ? 6 + estimateLines(definition.subtitle, 11, contentWidth - 18) * 15 : 0)
  const blockHeights = definition.blocks.map((block) => {
    if (block.type === 'divider') return 1
    if (block.type === 'text') {
      const size = block.style === 'headline' ? 22 : block.style === 'caption' ? 11 : block.style === 'quote' ? 16 : 13
      return Math.ceil(estimateLines(block.text, size, contentWidth) * size * 1.55)
    }
    if (block.type === 'metric') return block.trend ? 36 : 30
    if (block.type === 'progress') return 30
    if (block.type === 'clock') return 30
    if (block.type === 'countdown') return 50
    const title = block.title ? 21 : 0
    const items = block.items.reduce((total, item) => total + estimateLines(item.text, 12, contentWidth - 22) * 18, 0)
    return title + items + Math.max(0, block.items.length - 1) * 6
  })
  const body = blockHeights.reduce((total, height) => total + height, 0) + Math.max(0, blockHeights.length - 1) * 10
  const total = Math.ceil(40 + header + 12 + body + 8)
  return Math.max(GENERATED_WIDGET_MIN_SIZE.height, Math.min(GENERATED_WIDGET_MAX_SIZE.height, total))
}

function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function mixHex([r, g, b]: [number, number, number], target: number, amount: number): string {
  const mix = (value: number) => Math.round(value + (target - value) * amount).toString(16).padStart(2, '0')
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

/**
 * Accent used for text (countdowns, trends). The model may pick any accent;
 * a pale one on the light paper theme or a near-black one on dark themes
 * would make that text unreadable, so shift it toward readable contrast.
 */
export function getReadableGeneratedAccent(accent: string, theme: GeneratedWidgetTheme): string {
  const rgb = parseHexColor(accent)
  if (!rgb) return theme === 'paper' ? '#9a5b13' : '#ffb86b'
  const luminance = relativeLuminance(rgb)
  if (theme === 'paper') return luminance > 0.35 ? mixHex(rgb, 0, Math.min(0.7, (luminance - 0.2) * 1.4)) : accent
  return luminance < 0.12 ? mixHex(rgb, 255, 0.55) : accent
}
