import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'
import type { AppUpdateStatus } from '@shared/types'
import { toSafeUpdateErrorMessage } from '@shared/update-error'
import { getMainWindow } from '../windows/mainWindow'

const INITIAL_CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let initialized = false
let checkingPromise: Promise<void> | null = null
let initialCheckTimer: ReturnType<typeof setTimeout> | null = null
let scheduledCheckTimer: ReturnType<typeof setInterval> | null = null

let updateStatus: AppUpdateStatus = {
  phase: app.isPackaged ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
  message: app.isPackaged ? '尚未检查更新。' : '开发模式不连接更新服务。',
  canCheck: app.isPackaged,
  canInstall: false,
}

function publishStatus(patch: Partial<AppUpdateStatus>): void {
  updateStatus = { ...updateStatus, ...patch, currentVersion: app.getVersion() }
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC.APP_UPDATE_STATE_CHANGED, updateStatus)
  }
}

function onUpdateAvailable(info: UpdateInfo): void {
  publishStatus({
    phase: 'available',
    availableVersion: info.version,
    progressPercent: 0,
    message: `发现新版本 ${info.version}，正在后台下载。`,
    canCheck: false,
    canInstall: false,
  })
}

function onUpdateNotAvailable(info: UpdateInfo): void {
  publishStatus({
    phase: 'not-available',
    availableVersion: info.version,
    progressPercent: undefined,
    lastCheckedAt: Date.now(),
    message: '当前已是最新版本。',
    canCheck: true,
    canInstall: false,
  })
}

function onDownloadProgress(progress: ProgressInfo): void {
  publishStatus({
    phase: 'downloading',
    progressPercent: Math.max(0, Math.min(100, progress.percent)),
    transferredBytes: progress.transferred,
    totalBytes: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
    message: `新版本正在后台下载（${Math.round(progress.percent)}%）。`,
    canCheck: false,
    canInstall: false,
  })
}

function onUpdateDownloaded(info: UpdateInfo): void {
  publishStatus({
    phase: 'downloaded',
    availableVersion: info.version,
    progressPercent: 100,
    lastCheckedAt: Date.now(),
    message: `版本 ${info.version} 已下载。退出应用时会自动安装，也可以立即重启安装。`,
    canCheck: true,
    canInstall: true,
  })
}

export function initializeAutoUpdate(): void {
  if (initialized) return
  initialized = true

  if (!app.isPackaged) {
    publishStatus({
      phase: 'unsupported',
      message: '开发模式不连接更新服务。',
      canCheck: false,
      canInstall: false,
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    publishStatus({
      phase: 'checking',
      message: '正在检查更新…',
      canCheck: false,
      canInstall: updateStatus.phase === 'downloaded',
    })
  })
  autoUpdater.on('update-available', onUpdateAvailable)
  autoUpdater.on('update-not-available', onUpdateNotAvailable)
  autoUpdater.on('download-progress', onDownloadProgress)
  autoUpdater.on('update-downloaded', onUpdateDownloaded)
  autoUpdater.on('error', (error) => {
    publishStatus({
      phase: 'error',
      lastCheckedAt: Date.now(),
      message: `更新检查失败：${toSafeUpdateErrorMessage(error)}`,
      canCheck: true,
      canInstall: false,
    })
  })

  initialCheckTimer = setTimeout(() => {
    void checkForAppUpdates()
  }, INITIAL_CHECK_DELAY_MS)
  initialCheckTimer.unref()

  scheduledCheckTimer = setInterval(() => {
    void checkForAppUpdates()
  }, CHECK_INTERVAL_MS)
  scheduledCheckTimer.unref()

  app.once('will-quit', () => {
    if (initialCheckTimer) clearTimeout(initialCheckTimer)
    if (scheduledCheckTimer) clearInterval(scheduledCheckTimer)
  })
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return { ...updateStatus }
}

export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) return getAppUpdateStatus()
  if (checkingPromise) {
    await checkingPromise
    return getAppUpdateStatus()
  }
  if (updateStatus.phase === 'downloading' || updateStatus.phase === 'downloaded') {
    return getAppUpdateStatus()
  }

  checkingPromise = autoUpdater.checkForUpdates()
    .then(() => undefined)
    .catch((error: unknown) => {
      publishStatus({
        phase: 'error',
        lastCheckedAt: Date.now(),
        message: `更新检查失败：${toSafeUpdateErrorMessage(error)}`,
        canCheck: true,
        canInstall: false,
      })
    })
    .finally(() => {
      checkingPromise = null
    })
  await checkingPromise
  return getAppUpdateStatus()
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  if (!app.isPackaged || updateStatus.phase === 'downloaded') return getAppUpdateStatus()
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    publishStatus({
      phase: 'error',
      message: `更新下载失败：${toSafeUpdateErrorMessage(error)}`,
      canCheck: true,
      canInstall: false,
    })
  }
  return getAppUpdateStatus()
}

export function installDownloadedUpdate(): boolean {
  if (!app.isPackaged || updateStatus.phase !== 'downloaded') return false
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}
