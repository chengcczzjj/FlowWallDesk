import { useEffect, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'
import type { StockItem, StockSymbol } from '@shared/types'

const DEFAULT_SYMBOLS: StockSymbol[] = [
  { code: '000001', name: '上证指数', market: '1' },
  { code: '600519', name: '贵州茅台', market: '1' },
]
const DEFAULT_REFRESH = 30 // 秒
/** large (2×2) 可显示的最大条目数 */
const MAX_DISPLAY = 6

export function StocksWidget({ config }: { config?: Record<string, unknown> }) {
  const symbols = (config?.symbols as StockSymbol[]) || DEFAULT_SYMBOLS
  const refreshSec = (config?.refreshInterval as number) || DEFAULT_REFRESH

  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await window.canvasBridge.fetchStocks(symbols)
        if (!cancelled) setItems(data)
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    }

    load()
    timerRef.current = setInterval(load, refreshSec * 1000)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [JSON.stringify(symbols), refreshSec])

  const displayItems = items.slice(0, MAX_DISPLAY)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
        color: '#1a1a1a',
      }}
    >
      <FrostedGlassBackground />
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        padding: 16, width: '100%', height: '100%',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 600, fontSize: 14, color: '#0f7b0f' }}>
          <TrendingUp size={16} /> 自选股
        </div>
        {loading && items.length === 0 ? (
          <div style={{ fontSize: 13, color: '#999' }}>加载中…</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 13, color: '#999' }}>暂无数据</div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px',
            flex: 1, overflow: 'hidden',
          }}>
            {displayItems.map((stock) => (
              <div key={stock.code} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.03)', overflow: 'hidden',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', margin: '2px 0' }}>
                  {stock.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{
                  fontSize: 11,
                  color: stock.changePercent > 0 ? '#c42b1c' : stock.changePercent < 0 ? '#0f7b0f' : '#666',
                }}>
                  {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  {' '}
                  {stock.change > 0 ? '+' : ''}{stock.change.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
