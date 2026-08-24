import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { getMainWindow } from '../windows/mainWindow'
import { getCanvasWindow } from '../windows/canvasWindow'
import { isWallpaperWebContents } from '../windows/wallpaperWindow'

export type IpcWindowRole = 'main' | 'canvas' | 'wallpaper'

function roleWebContents(role: Exclude<IpcWindowRole, 'wallpaper'>): WebContents | null {
  if (role === 'main') return getMainWindow()?.webContents ?? null
  return getCanvasWindow()?.webContents ?? null
}

export function isTrustedIpcSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  allowedRoles: readonly IpcWindowRole[],
): boolean {
  return allowedRoles.some((role) => (
    role === 'wallpaper'
      ? isWallpaperWebContents(event.sender.id)
      : roleWebContents(role)?.id === event.sender.id
  ))
}

export function assertTrustedIpcSender(
  event: IpcMainEvent | IpcMainInvokeEvent,
  allowedRoles: readonly IpcWindowRole[],
): void {
  if (!isTrustedIpcSender(event, allowedRoles)) {
    throw new Error('IPC 请求来自未授权窗口。')
  }
}
