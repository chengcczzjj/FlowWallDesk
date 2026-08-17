import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { WallpaperOwnerConfigInput, WallpaperPublishInput } from '@shared/types'
import { assertTrustedIpcSender } from './ipcSecurity'
import {
  getWallpaperResourceCatalog,
  installWallpaperResource,
  removeWallpaperResource,
} from '../services/wallpaper-resource-service'
import {
  clearWallpaperOwnerCredentials,
  configureWallpaperOwner,
  getWallpaperOwnerStatus,
  publishWallpaperResource,
} from '../services/wallpaper-owner-service'

export function registerWallpaperResourceIpc(): void {
  ipcMain.handle(IPC.WALLPAPER_RESOURCE_CATALOG, (event) => {
    assertTrustedIpcSender(event, ['main'])
    return getWallpaperResourceCatalog(false)
  })
  ipcMain.handle(IPC.WALLPAPER_RESOURCE_REFRESH, (event) => {
    assertTrustedIpcSender(event, ['main'])
    return getWallpaperResourceCatalog(true)
  })
  ipcMain.handle(IPC.WALLPAPER_RESOURCE_INSTALL, (event, resourceId: string) => {
    assertTrustedIpcSender(event, ['main'])
    return installWallpaperResource(resourceId)
  })
  ipcMain.handle(IPC.WALLPAPER_RESOURCE_REMOVE, (event, resourceId: string) => {
    assertTrustedIpcSender(event, ['main'])
    return removeWallpaperResource(resourceId)
  })

  ipcMain.handle(IPC.WALLPAPER_OWNER_STATUS, (event) => {
    assertTrustedIpcSender(event, ['main'])
    return getWallpaperOwnerStatus()
  })
  ipcMain.handle(IPC.WALLPAPER_OWNER_CONFIGURE, (event, input: WallpaperOwnerConfigInput) => {
    assertTrustedIpcSender(event, ['main'])
    return configureWallpaperOwner(input)
  })
  ipcMain.handle(IPC.WALLPAPER_OWNER_CLEAR_CREDENTIALS, (event) => {
    assertTrustedIpcSender(event, ['main'])
    return clearWallpaperOwnerCredentials()
  })
  ipcMain.handle(IPC.WALLPAPER_OWNER_PUBLISH, (event, input: WallpaperPublishInput) => {
    assertTrustedIpcSender(event, ['main'])
    return publishWallpaperResource(input)
  })
}
