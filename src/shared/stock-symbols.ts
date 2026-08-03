import type { StockSymbol } from './types'

export const POPULAR_A_SHARE_SYMBOLS: readonly StockSymbol[] = [
  { code: '000001', name: '上证指数', market: '1' },
  { code: '399001', name: '深证成指', market: '0' },
  { code: '399006', name: '创业板指', market: '0' },
  { code: '600519', name: '贵州茅台', market: '1' },
  { code: '000858', name: '五粮液', market: '0' },
  { code: '601318', name: '中国平安', market: '1' },
  { code: '000333', name: '美的集团', market: '0' },
  { code: '002594', name: '比亚迪', market: '0' },
  { code: '600036', name: '招商银行', market: '1' },
  { code: '601012', name: '隆基绿能', market: '1' },
]

export function detectAStockMarket(code: string): '0' | '1' {
  return /^[659]/.test(code) ? '1' : '0'
}

function extractAStockCode(value: string): string | null {
  const match = value.trim().match(/(?:^|\D)(\d{6})(?:\D|$)/)
  return match?.[1] ?? null
}

function findPreset(value: string): StockSymbol | undefined {
  const normalized = value.trim().toLowerCase()
  return POPULAR_A_SHARE_SYMBOLS.find((item) => (
    item.code === normalized || item.name.toLowerCase() === normalized
  ))
}

export function normalizeStockSymbols(value: unknown, maxItems = 6): StockSymbol[] {
  const candidates = Array.isArray(value) ? value : value == null ? [] : [value]
  const result: StockSymbol[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    let code = ''
    let name = ''
    let market: '0' | '1' | '' = ''

    if (typeof candidate === 'string') {
      const preset = findPreset(candidate)
      code = preset?.code ?? extractAStockCode(candidate) ?? ''
      name = preset?.name ?? ''
      market = preset?.market === '1' ? '1' : preset?.market === '0' ? '0' : ''
    } else if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>
      const rawCode = typeof record.code === 'string'
        ? record.code
        : typeof record.symbol === 'string'
          ? record.symbol
          : ''
      const preset = findPreset(rawCode) ?? (
        typeof record.name === 'string' ? findPreset(record.name) : undefined
      )
      code = preset?.code ?? extractAStockCode(rawCode) ?? ''
      name = typeof record.name === 'string' && record.name.trim()
        ? record.name.trim().slice(0, 40)
        : preset?.name ?? ''
      market = record.market === '1' || record.market === 1
        ? '1'
        : record.market === '0' || record.market === 0
          ? '0'
          : preset?.market === '1'
            ? '1'
            : preset?.market === '0'
              ? '0'
              : ''
    }

    if (!code || seen.has(code)) continue
    seen.add(code)
    result.push({
      code,
      name: name || code,
      market: market || detectAStockMarket(code),
    })
    if (result.length >= maxItems) break
  }

  return result
}
