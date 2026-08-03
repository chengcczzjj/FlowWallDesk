import { useEffect, useMemo, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'
import type { StockItem, StockSymbol } from '@shared/types'
import { normalizeStockSymbols, POPULAR_A_SHARE_SYMBOLS } from '@shared/stock-symbols'

const DEFAULT_SYMBOLS: StockSymbol[] = POPULAR_A_SHARE_SYMBOLS.slice(0, 1).concat(POPULAR_A_SHARE_SYMBOLS[3])
const DEFAULT_REFRESH = 30 // 秒
/** large (2×2) 可显示的最大条目数 */
const MAX_DISPLAY = 6

export function StocksWidget({ config, entering = false }: { config?: Record<string, unknown>; entering?: boolean }) {
  const hasConfiguredSymbols = Object.prototype.hasOwnProperty.call(config ?? {}, 'symbols')
  const normalizedSymbols = useMemo(() => normalizeStockSymbols(config?.symbols), [config?.symbols])
  const symbols = hasConfiguredSymbols ? normalizedSymbols : DEFAULT_SYMBOLS
  const refreshSec = (config?.refreshInterval as number) || DEFAULT_REFRESH

  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealingItems, setRevealingItems] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasRenderedDataRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    hasRenderedDataRef.current = false

    const load = async () => {
      if (symbols.length === 0) {
        setItems([])
        setError('股票配置无效，请重新添加名称或六位代码')
        setLoading(false)
        return
      }
      try {
        const data = await window.canvasBridge.fetchStocks(symbols)
        if (!cancelled) {
          setItems(data)
          setError(data.length === 0 ? '暂时没有获取到行情，请稍后重试' : null)
          if (data.length > 0 && !hasRenderedDataRef.current) {
            hasRenderedDataRef.current = true
            setRevealingItems(true)
            if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
            revealTimerRef.current = setTimeout(() => setRevealingItems(false), 1_400)
          }
        }
      } catch {
        if (!cancelled) setError('行情连接失败，请稍后重试')
      }
      if (!cancelled) setLoading(false)
    }

    load()
    timerRef.current = setInterval(load, refreshSec * 1000)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
    }
  }, [symbols, refreshSec])

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#777' }}>
            <span>{error ?? '暂无数据'}</span>
            <span style={{ fontSize: 10, opacity: 0.72 }}>支持沪深 A 股与主要指数</span>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px',
            flex: 1, overflow: 'hidden',
          }}>
            {displayItems.map((stock) => (
              <div key={stock.code} className={entering || revealingItems ? 'widget-content-step' : undefined} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.03)', overflow: 'hidden',
                animationDelay: entering || revealingItems ? `${180 + displayItems.indexOf(stock) * 90}ms` : undefined,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', margin: '2px 0' }}>
                  {formatStockNumber(stock.price)}
                </div>
                <div style={{
                  fontSize: 11,
                  color: (stock.changePercent ?? 0) > 0 ? '#c42b1c' : (stock.changePercent ?? 0) < 0 ? '#0f7b0f' : '#666',
                }}>
                  {formatSignedStockNumber(stock.changePercent, '%')}
                  {' '}
                  {formatSignedStockNumber(stock.change)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatStockNumber(value: number | null): string {
  if (value == null) return '--'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSignedStockNumber(value: number | null, suffix = ''): string {
  if (value == null) return `--${suffix}`
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`
}
