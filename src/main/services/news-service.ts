/**
 * 新闻热搜 API 服务
 * 数据源：
 *  - 头条热搜：codelife.cc API（免费、无需 Key）
 *  - 微博热搜：weibo.com 官方 AJAX 接口
 *  - 百度/知乎/B站：codelife.cc API
 *
 * 返回字段：index, title, hot(热度值), url(链接)
 * 注意：这些 API 均不包含图片字段
 */
import { net } from 'electron'
import type { NewsItem } from '@shared/types'

/** 可选新闻来源 */
export const NEWS_SOURCES: Record<string, { name: string }> = {
  toutiao: { name: '头条热搜' },
  weibo:   { name: '微博热搜' },
  baidu:   { name: '百度热搜' },
  zhihu:   { name: '知乎热搜' },
  bilibili:{ name: 'B站热搜' },
}

interface CachedResult {
  data: NewsItem[]
  timestamp: number
}

const cache = new Map<string, CachedResult>()
const inFlight = new Map<string, Promise<NewsItem[]>>()
const CACHE_TTL = 60_000 // 缓存 1 分钟
const REQUEST_TIMEOUT_MS = 10_000
const UPSTREAM_ITEM_LIMIT = 30

/** 调用统计 */
export const newsUsage = { fetchCount: 0, lastFetchTime: null as number | null, errorCount: 0 }

/**
 * 从微博官方 AJAX 接口获取热搜
 */
async function fetchWeibo(maxItems: number): Promise<NewsItem[]> {
  const res = await net.fetch('https://weibo.com/ajax/side/hotSearch', {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { realtime?: { word: string; num?: number; rank?: number; label_name?: string }[] }
  }
  const list = json.data?.realtime
  if (!Array.isArray(list)) throw new Error('Unexpected weibo response')
  return list.slice(0, maxItems).map((item, i) => ({
    index: i + 1,
    title: item.word,
    hot: item.num ? String(item.num) : undefined,
    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
  }))
}

/**
 * 从 codelife.cc API 获取热搜（头条、百度、知乎、B站等）
 */
async function fetchCodelife(source: string, maxItems: number): Promise<NewsItem[]> {
  const url = `https://api.codelife.cc/api/top/list?lang=cn&id=${source}`
  const res = await net.fetch(url, { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    code?: number
    data?: { title: string; index: number; hotValue?: string; link?: string }[]
  }
  if (!Array.isArray(json.data)) throw new Error('Unexpected codelife response')
  return json.data.slice(0, maxItems).map((d) => ({
    index: d.index,
    title: d.title,
    hot: d.hotValue,
    url: d.link,
  }))
}

/**
 * 获取热搜新闻
 * @param source 来源 key (toutiao/weibo/baidu/zhihu/bilibili)
 * @param maxItems 返回条数上限
 */
export async function fetchNews(source: string, maxItems: number): Promise<NewsItem[]> {
  const limit = Math.max(1, Math.min(UPSTREAM_ITEM_LIMIT, Math.round(maxItems || 5)))
  if (!NEWS_SOURCES[source]) return []
  const cached = cache.get(source)
  // 命中缓存
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data.slice(0, limit)
  }

  const pending = inFlight.get(source)
  if (pending) return (await pending).slice(0, limit)

  const request = (async () => {
    let items: NewsItem[]

    if (source === 'weibo') {
      items = await fetchWeibo(UPSTREAM_ITEM_LIMIT)
    } else {
      items = await fetchCodelife(source, UPSTREAM_ITEM_LIMIT)
    }

    cache.set(source, { data: items, timestamp: Date.now() })
    newsUsage.fetchCount++
    newsUsage.lastFetchTime = Date.now()
    return items
  })().catch((err) => {
    newsUsage.errorCount++
    console.error('[NewsService] fetch failed:', err)
    if (cached) return cached.data
    return []
  }).finally(() => inFlight.delete(source))

  inFlight.set(source, request)
  return (await request).slice(0, limit)
}
