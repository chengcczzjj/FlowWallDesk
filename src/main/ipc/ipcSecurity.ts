import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { getMainWindow } from '../windows/mainWindow'
import { getCanvasWindow } from '../windows/canvasWindow'
import { getWallpaperWindow } from '../windows/wallpaperWindow'

export type IpcWindowRole = 'main' | 'canvas' | 'wallpaper'

function roleWebContents(role: IpcWindowRole): WebContents | null {
  if (role === 'main') return getMainWindow()?.webContents ?? null
  if (role === 'canvas') return getCanvasWindow()?.webContents ?? null
  return getWallpaperWindow()?.webContents ?? null
}

export function isTrustedIpcSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  allowedRoles: readonly IpcWindowRole[],
): boolean {
  return allowedRoles.some((role) => roleWebContents(role)?.id === event.sender.id)
}

export function assertTrustedIpcSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  allowedRoles: readonly IpcWindowRole[],
): void {
  if (!isTrustedIpcSender(event, allowedRoles)) {
    throw new Error('IPC 请求来自未授权窗口。')
  }
}
