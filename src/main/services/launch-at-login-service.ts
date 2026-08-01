import { app } from 'electron'
import type { LaunchAtLoginStatus } from '@shared/types'
import { store } from '../store'

function isSupported(): boolean {
  return process.platform === 'win32' && app.isPackaged
}

export function applyLaunchAtLoginPreference(): LaunchAtLoginStatus {
  const enabled = store.get('appSettings.launchAtLogin', true)
  if (!isSupported()) {
    return {
      enabled,
      supported: false,
      message: '开机自启动仅在正式安装版中生效。',
    }
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
    })
    return getLaunchAtLoginStatus()
  } catch (error) {
    return {
      enabled,
      supported: true,
      message: `更新开机启动项失败：${(error as Error).message}`,
    }
  }
}

export function getLaunchAtLoginStatus(): LaunchAtLoginStatus {
  const preferred = store.get('appSettings.launchAtLogin', true)
  if (!isSupported()) {
    return {
      enabled: preferred,
      supported: false,
      message: '开机自启动仅在正式安装版中生效。',
    }
  }

  try {
    return {
      enabled: app.getLoginItemSettings({ path: process.execPath }).openAtLogin,
      supported: true,
    }
  } catch (error) {
    return {
      enabled: preferred,
      supported: true,
      message: `读取开机启动项失败：${(error as Error).message}`,
    }
  }
}

export function setLaunchAtLoginEnabled(enabled: boolean): LaunchAtLoginStatus {
  store.set('appSettings.launchAtLogin', enabled)
  return applyLaunchAtLoginPreference()
}
