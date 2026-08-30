import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

import { IPC } from '../src/shared/ipc-channels.ts'
import { toSafeUpdateErrorMessage } from '../src/shared/update-error.ts'

test('stable release metadata and updater publishing stay wired together', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const builderConfig = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')

  assert.equal(packageJson.version, '1.1.8')
  assert.ok(packageJson.dependencies['electron-updater'])
  assert.match(packageJson.scripts['build:win'], /electron-builder --win/)
  assert.match(packageJson.scripts['build:win'], /signExecutable=false/)
  assert.match(builderConfig, /provider: github/)
  assert.match(builderConfig, /owner: chengcczzjj/)
  assert.match(builderConfig, /repo: FlowWallDesk/)
  assert.match(builderConfig, /artifactName: \$\{name\}-\$\{version\}-setup\.\$\{ext\}/)
  assert.match(builderConfig, /- out\/main\/\*\*\/\*/)
  assert.match(builderConfig, /- out\/preload\/\*\*\/\*/)
  assert.match(builderConfig, /- out\/renderer\/\*\*\/\*/)
  assert.doesNotMatch(builderConfig, /- out\/\*\*\/\*/)
})

test('update and launch-at-login IPC channels are unique and complete', () => {
  const channels = Object.values(IPC)
  assert.equal(new Set(channels).size, channels.length)

  for (const channel of [
    IPC.APP_GET_LAUNCH_AT_LOGIN,
    IPC.APP_SET_LAUNCH_AT_LOGIN,
    IPC.APP_UPDATE_GET_STATUS,
    IPC.APP_UPDATE_CHECK,
    IPC.APP_UPDATE_DOWNLOAD,
    IPC.APP_UPDATE_INSTALL,
    IPC.APP_UPDATE_STATE_CHANGED,
  ]) {
    assert.ok(channels.includes(channel))
  }
})

test('sandboxed windows use one role-gated preload bundle', async () => {
  const viteConfig = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
  const windowSources = await Promise.all([
    'mainWindow.ts',
    'canvasWindow.ts',
    'wallpaperWindow.ts',
  ].map((name) => readFile(new URL(`../src/main/windows/${name}`, import.meta.url), 'utf8')))

  assert.match(viteConfig, /index: resolve\(__dirname, 'src\/preload\/index\.ts'\)/)
  for (const source of windowSources) {
    assert.match(source, /preload: join\(__dirname, '\.\.\/preload\/index\.js'\)/)
    assert.match(source, /additionalArguments: \['--lingyue-window-role=/)
    assert.match(source, /sandbox: true/)
  }
})

test('update errors never expose response headers or cookies', () => {
  const message = toSafeUpdateErrorMessage(new Error('404\nHeaders: { "set-cookie": "secret" }'))
  assert.equal(message, '更新服务尚未发布可用版本，请在正式版本发布后重试。')
  assert.doesNotMatch(message, /cookie|secret|Headers/i)
  assert.ok(toSafeUpdateErrorMessage(new Error('custom failure\nprivate details')).length <= 180)
})

test('updates are user-started from the activity sidebar and restart after download', async () => {
  const updateService = await readFile(new URL('../src/main/services/update-service.ts', import.meta.url), 'utf8')
  const appSource = await readFile(new URL('../src/renderer/main-ui/App.tsx', import.meta.url), 'utf8')
  const settingsSource = await readFile(
    new URL('../src/renderer/main-ui/pages/settings/SettingsGeneralPage.tsx', import.meta.url),
    'utf8',
  )
  const sidebarUpdateSource = await readFile(
    new URL('../src/renderer/main-ui/components/SidebarUpdateButton.tsx', import.meta.url),
    'utf8',
  )
  const mainUiStyles = await readFile(new URL('../src/renderer/main-ui/styles.css', import.meta.url), 'utf8')

  assert.match(updateService, /autoUpdater\.autoDownload = false/)
  assert.match(updateService, /autoUpdater\.autoInstallOnAppQuit = false/)
  assert.match(updateService, /\['--updated', '\/S', '--force-run'\]/)
  assert.match(updateService, /PRIORITY_BELOW_NORMAL/)
  assert.match(updateService, /spawnLowPriorityInstaller/)
  assert.match(appSource, /<SidebarUpdateButton \/>/)
  assert.match(settingsSource, /版本与更新/)
  assert.match(settingsSource, /getUpdateStatus\(\)/)
  assert.match(settingsSource, /checkForUpdates\(\)/)
  assert.match(settingsSource, /onUpdateStateChanged/)
  assert.match(settingsSource, /检查更新/)
  assert.match(sidebarUpdateSource, /downloadUpdate\(\)/)
  assert.match(sidebarUpdateSource, /installUpdate\(\)/)
  assert.match(sidebarUpdateSource, /status\.phase === 'downloaded'/)
  assert.match(sidebarUpdateSource, /status\.phase === 'installing'/)
  const updateButtonStyles = mainUiStyles.slice(
    mainUiStyles.indexOf('.sidebar-update {'),
    mainUiStyles.indexOf('.sidebar-update:hover'),
  )
  assert.match(updateButtonStyles, /position: absolute/)
  assert.match(updateButtonStyles, /width: 34px/)
  assert.match(updateButtonStyles, /height: 34px/)
})

test('desktop icon launches stay bound to their persisted widget record', async () => {
  const preloadSource = await readFile(new URL('../src/preload/canvas.ts', import.meta.url), 'utf8')
  const ipcSource = await readFile(new URL('../src/main/ipc/desktopIconIpc.ts', import.meta.url), 'utf8')
  const canvasSource = await readFile(new URL('../src/main/windows/canvasWindow.ts', import.meta.url), 'utf8')
  const diagnosticSource = await readFile(new URL('../src/main/runtime/diagnosticLog.ts', import.meta.url), 'utf8')
  const widgetSource = await readFile(new URL('../src/renderer/widgets/DesktopIcons/DesktopIcons.tsx', import.meta.url), 'utf8')

  assert.match(preloadSource, /launchDesktopIcon: \(widgetId: string, item: DesktopIconItem, requestId\?: string\)/)
  assert.match(ipcSource, /findStoredDesktopIcon\(item\.id, widgetId\)/)
  assert.match(ipcSource, /store\.get\('globalIconWidgets'\)/)
  assert.match(ipcSource, /activateExistingAppWindow\(targetPath\)/)
  assert.match(diagnosticSource, /dock-diagnostics\.jsonl/)
  assert.match(diagnosticSource, /appendFile/)

  const healthTimer = canvasSource.slice(
    canvasSource.indexOf('canvasHealthTimer = setInterval'),
    canvasSource.indexOf('}, 300)', canvasSource.indexOf('canvasHealthTimer = setInterval')),
  )
  assert.doesNotMatch(healthTimer, /sendToBottom/)
  assert.match(canvasSource, /cursorHitTestTimer = setInterval\(refreshCanvasCursorHitTest, 25\)/)
  assert.match(canvasSource, /CANVAS_NATIVE_DOCK_CLICK/)
  assert.match(canvasSource, /shouldFallbackNativeDockClick/)
  assert.match(canvasSource, /WindowFromPoint/)
  assert.match(canvasSource, /canvasTopmostAtStart/)
  assert.match(canvasSource, /canvasTopmostAtEnd/)
  assert.match(canvasSource, /canvasRecompositing = true/)
  assert.match(canvasSource, /recoverCanvasAfterDesktopReturn[\s\S]*refreshWallpaperAttach\(\)[\s\S]*refreshCanvasZOrder\('desktop-return'\)/)
  assert.match(canvasSource, /refreshCanvasZOrder\('missing-renderer-hover'\)/)
  assert.match(canvasSource, /win\.showInactive\(\)[\s\S]*win\.webContents\.invalidate\(\)/)
  assert.match(canvasSource, /nativeMousePassthrough = null[\s\S]*applyCanvasMousePassthrough\(\)/)
  assert.match(canvasSource, /RENDERER_POINTER_STALE_MS/)
  assert.match(canvasSource, /CANVAS_POINTER_RESET/)
  assert.match(canvasSource, /shouldRecreateCanvasAfterInitialOcclusion/)
  assert.match(canvasSource, /shouldRecoverCanvasAfterDesktopReturn\(lastOcclusionDiagnostic\)/)
  assert.match(canvasSource, /canvas\.desktop-return-recovery-skipped/)
  assert.match(canvasSource, /canvas\.pointer-delivery-missed/)
  assert.match(canvasSource, /stale\.once\('closed', createReplacement\)/)
  assert.match(preloadSource, /onPointerReset/)
  assert.equal(widgetSource.match(/ICON_LAUNCH_SCALE_KEYFRAMES/g)?.length, 4)
  assert.match(widgetSource, /active=\{bouncing\}/)
  assert.equal(widgetSource.match(/initialScale=\{scale\.get\(\)\}/g)?.length, 2)
  assert.equal(widgetSource.match(/flipped=\{flipped\}\s+overlayKey=/g)?.length, 2)
  assert.doesNotMatch(widgetSource, /scale: (?:launching|bouncing) \? 1 : scale/)
  assert.match(widgetSource, /initial=\{\{ opacity: ICON_LAUNCH_OVERLAY_INITIAL_OPACITY, scale: initialScale \}\}/)
  assert.match(widgetSource, /transformOrigin: flipped \? 'top center' : 'bottom center'/)
  assert.match(widgetSource, /shouldAnimateDockSystemAction\(action\.id\)/)
  assert.doesNotMatch(widgetSource, /getDockBounceKeyframes/)
})

test('frosted glass frame updates avoid React commits without changing the visual pipeline', async () => {
  const wallpaperSource = await readFile(new URL('../src/renderer/wallpaper/Wallpaper.tsx', import.meta.url), 'utf8')
  const frameStoreSource = await readFile(new URL('../src/renderer/canvas/wallpaperFrameStore.ts', import.meta.url), 'utf8')
  const glassSource = await readFile(new URL('../src/renderer/widgets/FrostedGlassBackground.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(glassSource, /useSyncExternalStore/)
  assert.match(glassSource, /subscribeWallpaperFrame\(applyLatestFrame\)/)
  assert.match(glassSource, /image\.src = frame/)
  assert.match(frameStoreSource, /frame === activeSourceFrame/)
  assert.match(frameStoreSource, /frame === lastProcessedSourceFrame/)
  assert.match(frameStoreSource, /canvas\.width !== bitmap\.width/)
  assert.match(frameStoreSource, /ctx\.clearRect\(0, 0, canvas\.width, canvas\.height\)/)

  assert.ok(wallpaperSource.includes('c.width = 768'))
  assert.ok(wallpaperSource.includes("c.toDataURL('image/jpeg', 0.62)"))
  assert.ok(wallpaperSource.includes('setInterval(captureFrame, 250)'))
  assert.ok(frameStoreSource.includes('BASE_WALLPAPER_FRAME_BLUR_PX = 12'))
  assert.ok(frameStoreSource.includes("ctx.filter = `blur(${sourceBlurPx}px) saturate(1.12)`"))
  assert.ok(frameStoreSource.includes("canvas.toDataURL('image/jpeg', 0.68)"))
  assert.ok(glassSource.includes('blurPx ** 2 - BASE_WALLPAPER_FRAME_BLUR_PX ** 2'))
  assert.ok(glassSource.includes('saturate(1.08)'))
})
