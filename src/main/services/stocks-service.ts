/**
 * 股票行情 API 服务
 * 数据源：东方财富 push2 API — 免费、无需 API Key、JSON 格式
 */
import { net } from 'electron'
import type { StockItem } from '@shared/types'
import { detectAStockMarket, POPULAR_A_SHARE_SYMBOLS } from '@shared/stock-symbols'

/** 常用股票/指数预设（供 UI 快捷添加） */
export const POPULAR_STOCKS = POPULAR_A_SHARE_SYMBOLS

interface CachedResult {
  data: StockItem[]
  timestamp: number
}

const cache = new Map<string, CachedResult>()
const inFlight = new Map<string, Promise<StockItem[]>>()
const CACHE_TTL = 10_000 // 缓存 10 秒（股票需要较实时）
const REQUEST_TIMEOUT_MS = 10_000

/** 调用统计 */
export const stocksUsage = { fetchCount: 0, lastFetchTime: null as number | null, errorCount: 0 }

/**
 * 根据代码自动判断市场
 * 6/5/9 开头 → 沪市 (market=1)
 * 0/2/3/4 开头 → 深市 (market=0)
 */
export function detectMarket(code: string): string {
  return detectAStockMarket(code)
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim() || value.trim() === '-') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 获取股票实时行情
 * @param symbols 股票列表 [{code, name, market}]
 */
export async function fetchStocks(
  symbols: { code: string; name: string; market: string }[]
): Promise<StockItem[]> {
  if (symbols.length === 0) return []

  const secids = symbols.map((s) => `${s.market}.${s.code}`).join(',')
  const cached = cache.get(secids)

  // 命中缓存
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  const pending = inFlight.get(secids)
  if (pending) return pending

  const url =
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2` +
    `&fields=f2,f3,f4,f12,f14&secids=${secids}`

  const request = (async () => {
    const res = await net.fetch(url, { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = (await res.json()) as {
      rc: number
      data?: {
        diff?: { f2: unknown; f3: unknown; f4: unknown; f12: string; f14: string }[]
      }
    }

    if (json.rc !== 0 || !json.data?.diff) {
      throw new Error('Unexpected response format')
    }

    const items: StockItem[] = json.data.diff.map((d) => ({
      code: d.f12,
      name: d.f14,
      price: toNullableNumber(d.f2),
      change: toNullableNumber(d.f4),
      changePercent: toNullableNumber(d.f3),
    }))

    cache.set(secids, { data: items, timestamp: Date.now() })
    if (cache.size > 50) cache.delete(cache.keys().next().value!)
    stocksUsage.fetchCount++
    stocksUsage.lastFetchTime = Date.now()
    return items
  })().catch((err) => {
    stocksUsage.errorCount++
    console.error('[StocksService] fetch failed:', err)
    if (cached) return cached.data
    return []
  }).finally(() => inFlight.delete(secids))

  inFlight.set(secids, request)
  return request
}
