import { useEffect, useRef, useState } from 'react'
import { FrostedGlassBackground } from '../FrostedGlassBackground'
import type { NewsItem } from '@shared/types'

const DEFAULT_SOURCE = 'toutiao'
const DEFAULT_MAX_ITEMS = 6
const DEFAULT_REFRESH = 10 // 分钟
/** medium-v (1×2) 列表区最多显示条数（不含头条） */
const MAX_LIST = 5

export function NewsWidget({ config }: { config?: Record<string, unknown> }) {
  const source = (config?.source as string) || DEFAULT_SOURCE
  const maxItems = (config?.maxItems as number) || DEFAULT_MAX_ITEMS
  const refreshMin = (config?.refreshInterval as number) || DEFAULT_REFRESH

  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await window.canvasBridge.fetchNews(source, maxItems)
        if (!cancelled) setItems(data)
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    }

    load()
    timerRef.current = setInterval(load, refreshMin * 60_000)

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [source, maxItems, refreshMin])

  const featured = items[0]
  const list = items.slice(1, MAX_LIST + 1)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <FrostedGlassBackground overlayColor="rgba(255,255,255,0.6)" />
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
      }}>
        {/* 头条区域 — 占 55% 高度 */}
        <div style={{
          flex: '0 0 55%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
          position: 'relative', display: 'flex', alignItems: 'flex-end',
          overflow: 'hidden',
        }}>
          {/* 装饰性背景图案 */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.12,
            backgroundImage:
              'radial-gradient(circle at 20% 80%, #e94560 0%, transparent 50%), ' +
              'radial-gradient(circle at 80% 20%, #0f3460 0%, transparent 50%), ' +
              'radial-gradient(circle at 60% 60%, #533483 0%, transparent 40%)',
          }} />
          {/* 装饰圆弧 */}
          <div style={{
            position: 'absolute', top: -30, right: -20,
            width: 100, height: 100, borderRadius: '50%',
            background: 'rgba(233,69,96,0.15)',
          }} />
          <div style={{
            position: 'absolute', bottom: 30, left: -15,
            width: 60, height: 60, borderRadius: '50%',
            background: 'rgba(83,52,131,0.2)',
          }} />
          {/* 顶部标签 */}
          <div style={{
            position: 'absolute', top: 10, left: 12,
            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.12)', padding: '2px 8px',
            borderRadius: 4, backdropFilter: 'blur(4px)',
          }}>热搜头条</div>
          {/* 头条文字 */}
          <div style={{
            width: '100%', padding: '16px 12px 12px',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            color: '#fff',
          }}>
            {loading ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>加载中…</div>
            ) : featured ? (
              <>
                <div style={{
                  fontWeight: 700, fontSize: 14, lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}>{featured.title}</div>
                {featured.hot && (
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>🔥 {featured.hot}</div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7 }}>暂无数据</div>
            )}
          </div>
        </div>
        {/* 热搜列表 — 占 45% */}
        <div style={{
          flex: 1, padding: '8px 12px',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.5)', color: '#1a1a1a',
        }}>
          {list.length > 0 ? list.map((item, i) => (
            <div key={item.index} style={{
              fontSize: 11, fontWeight: 500, lineHeight: 1.3,
              padding: '4px 0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              borderBottom: i < list.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <span style={{
                display: 'inline-block', width: 16, textAlign: 'center',
                fontSize: 10, fontWeight: 700, marginRight: 4,
                color: i < 3 ? '#e94560' : '#aaa',
              }}>{item.index}</span>
              {item.title}
            </div>
          )) : (
            <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>{loading ? '加载中…' : '暂无数据'}</div>
          )}
        </div>
      </div>
    </div>
  )
}
