import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { createMainWindow, getMainWindow } from './windows/mainWindow'

let tray: Tray | null = null

export function createTray(): Tray {
  // 资源在 dev 与打包后路径不同
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'build', 'icon.ico')
    : join(__dirname, '../../resources/build/icon.ico')

  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('灵月 LingyueDesk')

  const menu = Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        } else {
          createMainWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  // 不用 setContextMenu（Windows 上会吞掉首次左键点击），改用 right-click 弹出
  tray.on('right-click', () => {
    tray?.popUpContextMenu(menu)
  })

  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible() && !win.isMinimized()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    } else {
      createMainWindow()
    }
  })

  return tray
}

export function getTray(): Tray | null {
  return tray
}
