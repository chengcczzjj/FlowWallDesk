/**
 * 数据服务 IPC — 为渲染进程提供新闻、股票等外部数据获取能力
 */
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { fetchNews } from '../services/news-service'
import { fetchStocks } from '../services/stocks-service'
import { getApiRegistry } from '../services/api-registry'

export function registerDataIpc(): void {
  /** 获取热搜新闻 */
  ipcMain.handle(IPC.DATA_FETCH_NEWS, async (_e, source: string, maxItems: number) => {
    return fetchNews(source || 'toutiao', maxItems || 5)
  })

  /** 获取股票实时行情 */
  ipcMain.handle(
    IPC.DATA_FETCH_STOCKS,
    async (_e, symbols: { code: string; name: string; market: string }[]) => {
      return fetchStocks(symbols || [])
    }
  )

  /** 获取 API 注册表（供 LLM 或调试使用） */
  ipcMain.handle(IPC.DATA_GET_API_REGISTRY, () => {
    return getApiRegistry()
  })
}
