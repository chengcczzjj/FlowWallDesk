import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  WidgetInstance,
  NewsItem,
  StockItem,
  StockSymbol,
  ApiEndpointMeta,
  DesktopIconImportResult,
  DesktopIconItem,
  DesktopIconLaunchResult,
} from '@shared/types'

const api = {
  onSync: (cb: (list: WidgetInstance[]) => void): (() => void) => {
    const handler = (_: unknown, list: WidgetInstance[]) => cb(list)
    ipcRenderer.on(IPC.WIDGET_SYNC, handler)
    return () => ipcRenderer.off(IPC.WIDGET_SYNC, handler)
  },
  getWidgets: (): Promise<WidgetInstance[]> => ipcRenderer.invoke(IPC.WIDGET_LIST),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send(IPC.CANVAS_SET_IGNORE_MOUSE, ignore)
  },
  updateWidget: (w: WidgetInstance) => ipcRenderer.invoke(IPC.WIDGET_UPDATE, w),
  /** 仅更新组件 config（不触发位置吸附） */
  updateWidgetConfig: (id: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.WIDGET_UPDATE_CONFIG, id, config),
  removeWidget: (id: string) => ipcRenderer.invoke(IPC.WIDGET_REMOVE, id),
  /** 原生右键菜单，返回用户选择的动作 */
  showContextMenu: (widgetId: string): Promise<'edit' | 'delete' | null> =>
    ipcRenderer.invoke(IPC.CANVAS_CONTEXT_MENU, widgetId),
  /** 编辑模式：z-order + 穿透 + 焦点 统一切换 */
  setEditMode: (on: boolean): void => {
    ipcRenderer.send(IPC.CANVAS_SET_EDIT_MODE, on)
  },
  /** 保存当前组件配置到壁纸文件夹 */
  saveWidgetConfig: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.WIDGET_CONFIG_SAVE),
  importDesktopIcons: (widgetId: string, filePaths: string[]): Promise<DesktopIconImportResult> =>
    ipcRenderer.invoke(IPC.DESKTOP_ICON_IMPORT, widgetId, filePaths),
  launchDesktopIcon: (item: DesktopIconItem): Promise<DesktopIconLaunchResult> =>
    ipcRenderer.invoke(IPC.DESKTOP_ICON_LAUNCH, item),
  refreshDesktopIcons: (items: DesktopIconItem[]): Promise<DesktopIconItem[]> =>
    ipcRenderer.invoke(IPC.DESKTOP_ICON_REFRESH, items),
  openSettings: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_OPEN_SETTINGS),
  openExplorer: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_OPEN_EXPLORER),
  showDesktop: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_SHOW_DESKTOP),
  /** 监听壁纸抽帧（用于毛玻璃效果） */
  onFrame: (cb: (data: string) => void): (() => void) => {
    const handler = (_: unknown, data: string) => cb(data)
    ipcRenderer.on(IPC.WALLPAPER_FRAME, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_FRAME, handler)
  },
  /** 获取热搜新闻 */
  fetchNews: (source: string, maxItems: number): Promise<NewsItem[]> =>
    ipcRenderer.invoke(IPC.DATA_FETCH_NEWS, source, maxItems),
  /** 获取股票实时行情 */
  fetchStocks: (symbols: StockSymbol[]): Promise<StockItem[]> =>
    ipcRenderer.invoke(IPC.DATA_FETCH_STOCKS, symbols),
  /** 获取 API 注册表（供 LLM 或调试使用） */
  getApiRegistry: (): Promise<ApiEndpointMeta[]> =>
    ipcRenderer.invoke(IPC.DATA_GET_API_REGISTRY),
}

export type CanvasPreload = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('canvasBridge', api)
} else {
  ;(window as unknown as { canvasBridge: typeof api }).canvasBridge = api
}
