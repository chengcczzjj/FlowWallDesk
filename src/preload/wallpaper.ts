import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperItem, WallpaperDisplayLayout } from '@shared/types'

const api = {
  /** 监听主进程下发的壁纸切换 */
  onLoad: (cb: (item: WallpaperItem) => void): (() => void) => {
    const handler = (_: unknown, item: WallpaperItem) => cb(item)
    ipcRenderer.on(IPC.WALLPAPER_LOAD, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_LOAD, handler)
  },
  /** 监听实时设置更新（音量、速度、缩放等） */
  onSettingUpdate: (cb: (key: string, value: unknown) => void): (() => void) => {
    const handler = (_: unknown, key: string, value: unknown) => cb(key, value)
    ipcRenderer.on(IPC.WALLPAPER_UPDATE_SETTING, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_UPDATE_SETTING, handler)
  },
  /** 渲染端主动拉取当前壁纸（避免错过 onLoad 事件） */
  getCurrent: (): Promise<{ current?: WallpaperItem } | undefined> =>
    ipcRenderer.invoke(IPC.WALLPAPER_GET_CURRENT),
  /** 发送壁纸抽帧给主进程（用于组件毛玻璃效果） */
  sendFrame: (data: string): void => {
    ipcRenderer.send(IPC.WALLPAPER_FRAME, data)
  },
  /** 通知主进程壁纸内容已可显示，避免空白窗口先贴到桌面 */
  notifyReady: (itemId: string, source: string): void => {
    ipcRenderer.send(IPC.WALLPAPER_READY, { itemId, source })
  },
  /** 监听全屏遮挡暂停/恢复帧捕获 */
  onPauseCapture: (cb: (paused: boolean) => void): (() => void) => {
    const handler = (_: unknown, paused: boolean) => cb(paused)
    ipcRenderer.on(IPC.WALLPAPER_PAUSE_CAPTURE, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_PAUSE_CAPTURE, handler)
  },
  onDisplayLayout: (cb: (layout: WallpaperDisplayLayout) => void): (() => void) => {
    const handler = (_: unknown, layout: WallpaperDisplayLayout) => cb(layout)
    ipcRenderer.on(IPC.WALLPAPER_DISPLAY_LAYOUT, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_DISPLAY_LAYOUT, handler)
  },
  onDisplayLayoutChanged: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.WALLPAPER_DISPLAY_LAYOUT_CHANGED, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_DISPLAY_LAYOUT_CHANGED, handler)
  },
  getDisplayLayout: (): Promise<WallpaperDisplayLayout | null> =>
    ipcRenderer.invoke(IPC.WALLPAPER_DISPLAY_GET_LAYOUT),
  onCaptureDemand: (cb: (enabled: boolean) => void): (() => void) => {
    const handler = (_: unknown, enabled: boolean) => cb(enabled)
    ipcRenderer.on(IPC.WALLPAPER_CAPTURE_DEMAND, handler)
    return () => ipcRenderer.off(IPC.WALLPAPER_CAPTURE_DEMAND, handler)
  },
}

export type WallpaperPreload = typeof api

export function exposeWallpaperApi(): void {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('wallpaperBridge', api)
  } else {
    ;(window as unknown as { wallpaperBridge: typeof api }).wallpaperBridge = api
  }
}
