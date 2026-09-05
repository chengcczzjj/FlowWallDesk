/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Electron acceptance entry. */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const process = require('node:process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const { console, setTimeout, clearTimeout } = globalThis
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
let root, win, completeModeChange
const calls = []
let failNext = false, autoComplete = false
const watchdog = setTimeout(() => { console.error('LIBRARY_TOOLBAR_TIMEOUT'); app.exit(1) }, 45000)
app.on('window-all-closed', () => {})

async function waitFor(code, label) {
  for (let i = 0; i < 120; i++) {
    if (await win.webContents.executeJavaScript(code)) return
    await sleep(50)
  }
  throw new Error('Timed out: ' + label)
}
const modeSelector = '[aria-label="选择显示器布局"]'
const targetSelector = '[aria-label="选择壁纸显示器"]'
const jsSelector = (selector) => `document.querySelector(${JSON.stringify(selector)})`
async function openPicker(selector) {
  await click(selector)
  await waitFor(`${jsSelector(selector)}.matches(':open')`, 'open picker')
  await sleep(60)
}
async function click(selector) {
  const point = await win.webContents.executeJavaScript(`(() => { const r=${jsSelector(selector)}.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
}
async function key(keyCode) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  await sleep(60)
}
async function snapshot(name) {
  await sleep(300)
  await fs.writeFile(join(resolve('out'), name), (await win.webContents.capturePage()).toPNG())
}

async function run() {
  root = process.env.LINGYUE_SMOKE_ROOT
  assert.ok(root, 'Run through tests/electron/run-smoke.mjs for post-exit cleanup')
  app.setPath('userData', join(root, 'userData'))
  app.setPath('sessionData', join(root, 'sessionData'))
  const { createTsLoader, projectRoot } = await import('../helpers/load-ts.mjs')
  const load = createTsLoader(), protocol = load('src/main/protocols.ts')
  const { IPC } = load('src/shared/ipc-channels.ts')
  protocol.registerAssetSchemePrivileged()
  await app.whenReady()
  await fs.writeFile(join(root, 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#d3e8f2"/><circle cx="230" cy="80" r="100" fill="#a9c8dc"/></svg>')
  await protocol.allowAssetRoot(root)
  protocol.registerAssetProtocol()
  const wallpapers = ['Quiet lake', 'Morning light'].map((name, i) => ({ id: `test-${i}`, name, type: 'image', source: join(root, 'cover.svg'), preview: join(root, 'cover.svg') }))
  let settings = { mode: 'primary', assignments: { one: 'test-0', two: 'test-1' }, displays: [
    { id: 1, key: 'one', label: 'Display 1', primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
    { id: 2, key: 'two', label: 'Display 2', primary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
  ] }
  ipcMain.handle(IPC.WALLPAPER_LIST, () => wallpapers)
  ipcMain.handle(IPC.WALLPAPER_GET_CURRENT, () => ({ current: wallpapers[0], volume: .5, muted: true }))
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_GET_SETTINGS, () => settings)
  ipcMain.handle(IPC.APP_UPDATE_GET_STATUS, () => ({ phase: 'idle', currentVersion: '1.1.12' }))
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_SET_MODE, async (_event, mode) => {
    calls.push(mode)
    if (failNext) { failNext = false; throw new Error('Test layout unavailable') }
    if (!autoComplete) await new Promise((done) => { completeModeChange = done })
    settings = { ...settings, mode }
    return settings
  })
  win = new BrowserWindow({ show: false, width: 1120, height: 760, frame: false, webPreferences: {
    sandbox: true, contextIsolation: true, preload: join(projectRoot, 'out/preload/index.js'),
    offscreen: true, additionalArguments: ['--lingyue-window-role=main'], backgroundThrottling: false,
  } })
  await win.loadFile(join(projectRoot, 'out/renderer/main-ui/index.html'), { query: { activity: 'library', subPage: 'library' } })
  await waitFor(`${jsSelector(modeSelector)} && !${jsSelector(modeSelector)}.disabled && document.querySelectorAll('.wallpaper-card').length > 0`, 'loaded toolbar')
  const layout = await win.webContents.executeJavaScript(`(() => {
    const picker=${jsSelector(modeSelector)},nav=document.querySelector('.top-nav').getBoundingClientRect(),content=document.querySelector('.library-content').getBoundingClientRect();
    return {supported:CSS.supports('appearance','base-select'),appearance:getComputedStyle(picker).appearance,navHeight:nav.height,extraRows:content.top-nav.bottom,oldBanner:!!document.querySelector('.library-toolbar'),inNav:!!picker.closest('.top-nav'),radius:getComputedStyle(picker,'::picker(select)').borderRadius}
  })()`)
  assert.equal(layout.supported, true)
  assert.equal(layout.appearance, 'base-select')
  assert.equal(layout.oldBanner, false)
  assert.equal(layout.inNav, true)
  assert.ok(layout.navHeight <= 48 && Math.abs(layout.extraRows) < 1)
  assert.equal(layout.radius, '12px')
  await openPicker(modeSelector)
  await snapshot('library-toolbar-menu.png')
  await key('Escape')
  await waitFor(`!${jsSelector(modeSelector)}.matches(':open')`, 'escape closes')
  assert.equal(calls.length, 0)
  await openPicker(modeSelector)
  await click('.library-content')
  await waitFor(`!${jsSelector(modeSelector)}.matches(':open')`, 'outside click closes')
  assert.equal(calls.length, 0)
  await openPicker(modeSelector)
  await click(`${modeSelector} option[value="per-display"]`)
  await waitFor(`${jsSelector(modeSelector)}.disabled`, 'pending disables picker')
  assert.deepEqual(calls, ['per-display'])
  completeModeChange()
  autoComplete = true
  await waitFor(`${jsSelector(targetSelector)} && !${jsSelector(modeSelector)}.disabled`, 'per-display target')
  await openPicker(targetSelector)
  await click(`${targetSelector} option[value="2"]`)
  await waitFor(`${jsSelector(targetSelector)}.value === '2'`, 'target selection')
  assert.equal(calls.length, 1)
  await waitFor(`document.querySelector('.wallpaper-card.applied')?.textContent.includes('Morning light')`, 'target wallpaper follows selected display')
  failNext = true
  await openPicker(modeSelector)
  await click(`${modeSelector} option[value="span"]`)
  await waitFor(`document.querySelector('[role="alert"]') && !${jsSelector(modeSelector)}.disabled`, 'failure feedback')
  assert.equal(await win.webContents.executeJavaScript(`${jsSelector(modeSelector)}.value`), 'per-display')
  await click('[aria-label="关闭显示设置错误"]')
  for (const width of [960, 760]) {
    win.setSize(width, 700)
    await sleep(120)
    const fits = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.wallpaper-display-picker')).every(p=>{const r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}) && document.querySelector('.top-nav').getBoundingClientRect().height === 48`)
    assert.ok(fits, 'Toolbar stays compact at width ' + width)
  }
  await snapshot('library-toolbar-compact.png')
  await openPicker(modeSelector)
  await key('Home')
  await key('Enter')
  await waitFor(`${jsSelector(modeSelector)}.value === 'primary' && !${jsSelector(modeSelector)}.disabled`, 'keyboard selects mode')
  assert.deepEqual(calls, ['per-display', 'span', 'primary'])
  console.log('LIBRARY_TOOLBAR_SMOKE_PASS ' + JSON.stringify({ ...layout, pointerSelection: true, keyboardSelection: true, escape: true, outsideClick: true, targetWallpaper: true, busyGuard: true, errorRecovery: true, widths: [1120, 960, 760], chrome: process.versions.chrome }))
}
run().then(() => {
  win?.destroy()
  clearTimeout(watchdog)
  app.exit(0)
}).catch((error) => {
  console.error(error)
  win?.destroy()
  clearTimeout(watchdog)
  app.exit(1)
})
