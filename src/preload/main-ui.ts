import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperItem, WallpaperSettings, WidgetInstance, NewsItem, StockItem, StockSymbol, ApiEndpointMeta } from '@shared/types'

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
    quit: (): void => ipcRenderer.send(IPC.APP_QUIT),
  },
  utils: {
    getFilePath: (file: File): string => webUtils.getPathForFile(file),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.WIN_MINIMIZE),
    maximizeToggle: () => ipcRenderer.send(IPC.WIN_MAXIMIZE_TOGGLE),
    close: () => ipcRenderer.send(IPC.WIN_CLOSE),
  },
  wallpaper: {
    list: (): Promise<WallpaperItem[]> => ipcRenderer.invoke(IPC.WALLPAPER_LIST),
    getCurrent: () => ipcRenderer.invoke(IPC.WALLPAPER_GET_CURRENT),
    apply: (item: WallpaperItem): Promise<boolean> =>
      ipcRenderer.invoke(IPC.WALLPAPER_APPLY, item),
    pickFile: (): Promise<WallpaperItem | null> => ipcRenderer.invoke(IPC.WALLPAPER_PICK_FILE),
    attachStatus: (): Promise<boolean> => ipcRenderer.invoke(IPC.WALLPAPER_ATTACH_STATUS),
    saveSettings: (wallpaperId: string, settings: WallpaperSettings): Promise<boolean> =>
      ipcRenderer.invoke(IPC.WALLPAPER_SAVE_SETTINGS, wallpaperId, settings),
    updateSetting: (key: string, value: unknown): Promise<boolean> =>
      ipcRenderer.invoke(IPC.WALLPAPER_UPDATE_SETTING, key, value),
    import: (
      filePath: string,
      meta: { name: string; desc: string; author: string; contact: string }
    ): Promise<{ ok: boolean; item?: WallpaperItem; error?: string }> =>
      ipcRenderer.invoke(IPC.WALLPAPER_IMPORT, filePath, meta),
  },
  widget: {
    list: (): Promise<WidgetInstance[]> => ipcRenderer.invoke(IPC.WIDGET_LIST),
    add: (w: WidgetInstance) => ipcRenderer.invoke(IPC.WIDGET_ADD, w),
    remove: (id: string) => ipcRenderer.invoke(IPC.WIDGET_REMOVE, id),
    update: (w: WidgetInstance) => ipcRenderer.invoke(IPC.WIDGET_UPDATE, w),
    updateConfig: (id: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.WIDGET_UPDATE_CONFIG, id, config),
    saveConfig: (): Promise<boolean> => ipcRenderer.invoke(IPC.WIDGET_CONFIG_SAVE),
    loadConfig: (wallpaperId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.WIDGET_CONFIG_LOAD, wallpaperId),
  },
  data: {
    fetchNews: (source: string, maxItems: number): Promise<NewsItem[]> =>
      ipcRenderer.invoke(IPC.DATA_FETCH_NEWS, source, maxItems),
    fetchStocks: (symbols: StockSymbol[]): Promise<StockItem[]> =>
      ipcRenderer.invoke(IPC.DATA_FETCH_STOCKS, symbols),
    getApiRegistry: (): Promise<ApiEndpointMeta[]> =>
      ipcRenderer.invoke(IPC.DATA_GET_API_REGISTRY),
  },
}

export type LingyueApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('lingyue', api)
  } catch (err) {
    console.error(err)
  }
} else {
  ;(window as unknown as { lingyue: typeof api }).lingyue = api
}
