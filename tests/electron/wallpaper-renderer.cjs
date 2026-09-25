/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron smoke entry uses CommonJS before app readiness. */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const { join, resolve, relative, isAbsolute } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')
const { console, setTimeout, clearTimeout, Buffer } = globalThis
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const windows = []
let root
const watchdog = setTimeout(() => { console.error('RENDERER_SMOKE_TIMEOUT'); app.exit(1) }, 45000)

async function waitFor(fn, label) {
  for (let i = 0; i < 120; i++) { if (await fn()) return; await sleep(50) }
  throw new Error('Timed out: ' + label)
}

// Cleanup must finish before explicitly choosing the test exit code.
app.on('window-all-closed', () => {})

async function run() {
  root = await fs.mkdtemp(join(tmpdir(), 'lingyue-renderer-smoke-'))
  app.setPath('userData', join(root, 'userData'))
  app.setPath('sessionData', join(root, 'sessionData'))
  const { createTsLoader, projectRoot } = await import('../helpers/load-ts.mjs')
  const load = createTsLoader(), protocol = load('src/main/protocols.ts')
  const { IPC } = load('src/shared/ipc-channels.ts')
  protocol.registerAssetSchemePrivileged()
  await app.whenReady()
  const recording = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } })
  windows.push(recording)
  await fs.writeFile(join(root, 'record.html'), '<!doctype html><canvas width="128" height="72"></canvas>')
  await recording.loadFile(join(root, 'record.html'))
  const bytes = await recording.webContents.executeJavaScript(`new Promise(resolve => {
    const canvas = document.querySelector('canvas'), ctx=canvas.getContext('2d');
    const recorder = new MediaRecorder(canvas.captureStream(15), {mimeType:'video/webm;codecs=vp8'});
    const chunks=[]; let frame=0;
    recorder.ondataavailable=e=>chunks.push(e.data);
    recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
    recorder.start();
    const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#ff0000':'#00ff00';ctx.fillRect(0,0,128,72)},65);
    setTimeout(()=>{clearInterval(timer);recorder.stop()},2400);
  })`)
  const source = join(root, 'fixture.webm')
  await fs.writeFile(source, Buffer.from(bytes))
  await protocol.allowUserSelectedAsset(source)
  protocol.registerAssetProtocol()
  const current = { id: 'primary', name: 'Primary', type: 'video', source, settings: { volume: 80, speed: 1 } }
  const bounds = { x: 0, y: 0, width: 640, height: 360 }
  const makeLayout = (id, volume = 20, mode = 'per-display', primary = true, epoch = Date.now()) => ({
    mode, virtualBounds: bounds, playback: { epochMs: epoch, audioEnabled: primary || mode === 'per-display' },
    displays: [{ displayId: id, displayKey: 'screen-' + id, bounds, localBounds: bounds,
      item: { ...current, id: 'secondary', settings: { volume, speed: 1 } } }],
  })
  const layouts = new Map(), currentGates = new Map()
  let releaseInitial
  const initialGate = new Promise((done) => { releaseInitial = done })
  let initialRequested = false
  ipcMain.handle(IPC.WALLPAPER_DISPLAY_GET_LAYOUT, async (event) => {
    const snapshot = layouts.get(event.sender.id)
    if (!initialRequested) { initialRequested = true; await initialGate }
    return snapshot
  })
  ipcMain.handle(IPC.WALLPAPER_GET_CURRENT, async (event) => { await (currentGates.get(event.sender.id) ?? sleep(500)); return { current } })
  ipcMain.on(IPC.WALLPAPER_READY, (event) => {
    event.sender.send(IPC.WALLPAPER_CAPTURE_DEMAND, false)
    event.sender.send(IPC.WALLPAPER_PAUSE_CAPTURE, false)
  })
  const createWallpaper = async (volume, item, currentGate) => {
    const win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      preload: join(projectRoot, 'out/preload/index.js'), additionalArguments: ['--lingyue-window-role=wallpaper'],
    } })
    windows.push(win)
    const layout = makeLayout(win.webContents.id, volume)
    if (item) layout.displays[0].item = item
    layouts.set(win.webContents.id, layout)
    if (currentGate) currentGates.set(win.webContents.id, currentGate)
    await win.loadFile(join(projectRoot, 'out/renderer/wallpaper/index.html'))
    return win
  }
  const one = await createWallpaper(20)
  await waitFor(() => initialRequested, 'initial layout request')
  // Push a newer zero-volume layout while the old initial query is still delayed.
  const latest = makeLayout(one.webContents.id, 0)
  layouts.set(one.webContents.id, latest)
  one.webContents.send(IPC.WALLPAPER_DISPLAY_LAYOUT, latest)
  await waitFor(() => one.webContents.executeJavaScript('Boolean(document.querySelector("video"))'), 'video element')
  releaseInitial()
  await sleep(900)
  const value = await one.webContents.executeJavaScript(`({volume:document.querySelector('video').volume, muted:document.querySelector('video').muted, bridge:typeof wallpaperBridge, mainAbsent:typeof window.lingyue==='undefined'})`)
  assert.equal(value.volume, 0, 'delayed initial layout/current must not overwrite zero volume')
  assert.equal(value.muted, true)
  assert.equal(value.bridge, 'object')
  assert.equal(value.mainAbsent, true)

  const two = await createWallpaper(30)
  await waitFor(() => two.webContents.executeJavaScript('document.querySelector("video")?.readyState >= 2'), 'second video decoded')
  await sleep(700)
  assert.equal(await two.webContents.executeJavaScript('document.querySelector("video").volume'), 0.3, 'primary current must not overwrite secondary settings')
  for (const win of [one, two]) {
    // MediaRecorder emits live WebM without a duration header; probing the end
    // lets Chromium determine the synthetic clip's finite duration for seeking.
    await win.webContents.executeJavaScript(`{const v=document.querySelector('video');if(!Number.isFinite(v.duration))v.currentTime=1000000;}`)
    await waitFor(() => win.webContents.executeJavaScript('Number.isFinite(document.querySelector("video").duration)'), 'finite fixture duration')
  }
  const epoch = Date.now()
  for (const [i, win] of [one, two].entries()) {
    const layout = makeLayout(win.webContents.id, 35, 'duplicate', i === 0, epoch)
    layouts.set(win.webContents.id, layout)
    win.webContents.send(IPC.WALLPAPER_DISPLAY_LAYOUT, layout)
  }
  await sleep(500)
  await two.webContents.executeJavaScript(`{const v=document.querySelector('video');v.currentTime=(v.currentTime+0.7)%v.duration}`)
  await sleep(1700)
  const playback = await Promise.all([one, two].map((win) => win.webContents.executeJavaScript(`({time:document.querySelector('video').currentTime,duration:document.querySelector('video').duration,muted:document.querySelector('video').muted,paused:document.querySelector('video').paused})`)))
  assert.equal(playback[0].paused, false)
  assert.equal(playback[1].paused, false)
  assert.equal(playback[0].muted, false)
  assert.equal(playback[1].muted, true)
  const diff = Math.abs(playback[0].time - playback[1].time)
  const loopDiff = Math.min(diff, Math.abs(playback[0].duration - diff))
  assert.ok(loopDiff < 0.25, 'video convergence: ' + JSON.stringify(playback))
  const imageSource = join(root, 'still.svg'), webSource = join(root, 'still.html')
  await fs.writeFile(imageSource, '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>')
  await fs.writeFile(webSource, '<!doctype html><body style="background:green">Static fixture</body>')
  await protocol.allowUserSelectedAsset(imageSource)
  await protocol.allowUserSelectedAsset(webSource)
  const stills = [
    { id: 'still-image', name: 'Still image', type: 'image', source: imageSource },
    { id: 'still-web', name: 'Still web', type: 'web', source: webSource, webUrl: await protocol.createWallpaperWebUrl(webSource) },
  ]
  for (const item of stills) {
    let releaseCurrent
    const currentGate = new Promise((done) => { releaseCurrent = done })
    const win = await createWallpaper(0, item, currentGate)
    const tag = item.type === 'image' ? 'img' : 'iframe'
    const opacity = 'document.querySelector("' + tag + '")?.style.opacity'
    await waitFor(async () => await win.webContents.executeJavaScript(opacity) === '1', item.type + ' visible')
    releaseCurrent()
    await sleep(200)
    assert.equal(await win.webContents.executeJavaScript(opacity), '1', item.type + ' remains visible after delayed primary current')
    win.webContents.send(IPC.WALLPAPER_LOAD, current)
    await sleep(200)
    assert.equal(await win.webContents.executeJavaScript(opacity), '1', item.type + ' remains visible after legacy primary load')
  }
  console.log('RENDERER_SMOKE_PASS ' + JSON.stringify({ delayedSnapshotVolume: value.volume, secondaryVolume: 0.3, loopDifferenceSeconds: loopDiff, playback, staticSurfacesRemainVisible: true }))
}

run().then(() => finish(0), (error) => { console.error(error); return finish(1) })
async function finish(code) {
  clearTimeout(watchdog)
  for (const win of windows) if (!win.isDestroyed()) win.destroy()
  if (root) {
    const rel = relative(resolve(tmpdir()), resolve(root))
    assert.ok(!isAbsolute(rel) && rel.startsWith('lingyue-renderer-smoke-') && !rel.includes('..'))
    await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }
  app.exit(code)
}
