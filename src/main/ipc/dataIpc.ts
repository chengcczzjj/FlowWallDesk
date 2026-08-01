/**
 * 数据服务 IPC — 为渲染进程提供新闻、股票等外部数据获取能力
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import { fetchNews } from '../services/news-service'
import { fetchStocks } from '../services/stocks-service'
import { getApiRegistry } from '../services/api-registry'
import { fetchWeatherSnapshot } from '../services/weather-service'
import { assertTrustedIpcSender } from './ipcSecurity'

const stockSymbolsSchema = z.array(z.object({
  code: z.string().regex(/^\d{5,6}$/),
  name: z.string().trim().min(1).max(80),
  market: z.enum(['0', '1']),
})).max(30)

export function registerDataIpc(): void {
  /** 获取热搜新闻 */
  ipcMain.handle(IPC.DATA_FETCH_NEWS, async (_e, source: string, maxItems: number) => {
    assertTrustedIpcSender(_e, ['main', 'canvas'])
    const parsedSource = z.enum(['toutiao', 'weibo', 'baidu', 'zhihu', 'bilibili']).catch('toutiao').parse(source)
    const parsedLimit = z.number().int().min(1).max(30).catch(5).parse(maxItems)
    return fetchNews(parsedSource, parsedLimit)
  })

  /** 获取股票实时行情 */
  ipcMain.handle(
    IPC.DATA_FETCH_STOCKS,
    async (_e, symbols: { code: string; name: string; market: string }[]) => {
      assertTrustedIpcSender(_e, ['main', 'canvas'])
      return fetchStocks(stockSymbolsSchema.parse(symbols || []))
    }
  )

  ipcMain.handle(IPC.DATA_FETCH_WEATHER, async (_e, options?: { city?: string; days?: number }) => {
    assertTrustedIpcSender(_e, ['main', 'canvas'])
    const parsed = z.object({
      city: z.string().trim().max(120).optional(),
      days: z.number().int().min(1).max(7).optional(),
    }).parse(options ?? {})
    return fetchWeatherSnapshot(parsed)
  })

  /** 获取 API 注册表（供 LLM 或调试使用） */
  ipcMain.handle(IPC.DATA_GET_API_REGISTRY, (event) => {
    assertTrustedIpcSender(event, ['main', 'canvas'])
    return getApiRegistry()
  })
}
