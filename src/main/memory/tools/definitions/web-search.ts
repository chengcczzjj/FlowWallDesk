/**
 * 网络搜索工具
 * 使用 DuckDuckGo Instant Answer API（免费、无需 API Key）
 * 如果用户配置了其他搜索 API，会优先使用
 */
import { tool } from 'ai'
import { z } from 'zod'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * DuckDuckGo Instant Answer API
 * 免费使用，无需 API key，返回结构化摘要
 */
async function duckDuckGoSearch(query: string): Promise<{ abstract: string; results: SearchResult[] }> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    no_html: '1',
    skip_disambig: '1',
  })

  const res = await fetch(`https://api.duckduckgo.com/?${params.toString()}`, {
    headers: { 'User-Agent': 'LingyueDesk/1.0' },
  })

  if (!res.ok) {
    throw new Error(`搜索请求失败: HTTP ${res.status}`)
  }

  const data = await res.json() as {
    Abstract?: string
    AbstractURL?: string
    AbstractSource?: string
    Heading?: string
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
    Results?: Array<{ Text?: string; FirstURL?: string }>
  }

  const results: SearchResult[] = []

  // 主要结果
  if (data.Results) {
    for (const r of data.Results.slice(0, 5)) {
      if (r.Text && r.FirstURL) {
        results.push({ title: r.Text.slice(0, 100), url: r.FirstURL, snippet: r.Text })
      }
    }
  }

  // 相关话题
  if (data.RelatedTopics) {
    for (const t of data.RelatedTopics.slice(0, 5)) {
      if (t.Text && t.FirstURL) {
        results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text })
      }
    }
  }

  return {
    abstract: data.Abstract || data.Heading || '未找到直接摘要',
    results: results.slice(0, 8),
  }
}

/**
 * 备用方案：使用 DuckDuckGo HTML 搜索（当 Instant Answer 无结果时）
 */
async function duckDuckGoHtmlSearch(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query })
  const res = await fetch(`https://html.duckduckgo.com/html/?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  })

  if (!res.ok) return []

  const html = await res.text()
  const results: SearchResult[] = []

  // 简单正则提取搜索结果（不依赖 DOM parser）
  const snippetRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]*)/g
  let match: RegExpExecArray | null
  while ((match = snippetRegex.exec(html)) !== null && results.length < 6) {
    const [, url, title, snippet] = match
    if (url && title) {
      results.push({
        title: title.trim(),
        url: decodeURIComponent(url.replace(/.*uddg=/, '').split('&')[0] || url),
        snippet: snippet?.trim() || '',
      })
    }
  }

  return results
}

export const webSearchTool = tool({
  description:
    '在互联网上搜索信息。当用户询问你不确定的事实、最新新闻、具体数据时使用。返回搜索摘要和相关链接。',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词'),
  }),
  execute: async ({ query }) => {
    try {
      // 优先使用 Instant Answer API
      const { abstract, results } = await duckDuckGoSearch(query)

      // 如果没有结果，fallback 到 HTML 搜索
      if (!results.length && abstract === '未找到直接摘要') {
        const htmlResults = await duckDuckGoHtmlSearch(query)
        if (htmlResults.length) {
          return {
            query,
            abstract: '以下是搜索到的相关结果：',
            results: htmlResults,
            source: 'duckduckgo',
          }
        }
      }

      return {
        query,
        abstract,
        results,
        source: 'duckduckgo',
      }
    } catch (e) {
      return {
        query,
        error: (e as Error).message,
        results: [],
      }
    }
  },
})
