/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron smoke entry uses CommonJS before app readiness. */
// Run explicitly with Electron, never with the application's normal entrypoint.
// Uses a hidden window and synthetic temp files; does not attach to the desktop.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const { join, resolve, relative, isAbsolute } = require('node:path')
const { tmpdir } = require('node:os')
const { console, setTimeout, clearTimeout, URL } = globalThis
const assert = require('node:assert/strict')
let root, win
const watchdog = setTimeout(() => { console.error('SANDBOX_SMOKE_TIMEOUT'); app.exit(1) }, 30000)

// Cleanup must finish before explicitly choosing the test exit code.
app.on('window-all-closed', () => {})

async function run() {
  root = await fs.mkdtemp(join(tmpdir(), 'lingyue-electron-smoke-'))
  app.setPath('userData', join(root, 'userData'))
  app.setPath('sessionData', join(root, 'sessionData'))
  const { createTsLoader } = await import('../helpers/load-ts.mjs')
  const protocol = createTsLoader()('src/main/protocols.ts')
  protocol.registerAssetSchemePrivileged()
  await app.whenReady()
  const owned = join(root, 'wallpapers'), dir = join(owned, 'A'), other = join(owned, 'B')
  await fs.mkdir(dir, { recursive: true })
  await fs.mkdir(other, { recursive: true })
  await fs.writeFile(join(dir, 'index.html'), '<!doctype html><link rel="stylesheet" href="style.css"><script src="app.js"></script><body>Wallpaper fixture</body>')
  await fs.writeFile(join(dir, 'app.js'), 'window.ownScriptLoaded = true')
  await fs.writeFile(join(dir, 'style.css'), 'body{color:rgb(12,34,56)}')
  await fs.writeFile(join(dir, 'data.json'), '{"safe":true}')
  await fs.writeFile(join(other, 'index.html'), '<!doctype html>Other')
  await fs.writeFile(join(other, 'data.json'), '{"private":true}')
  await fs.writeFile(join(root, 'selected.html'), '<!doctype html>Standalone')
  await fs.writeFile(join(root, 'private.txt'), 'synthetic-private-fixture')
  await fs.writeFile(join(root, 'parent.html'), '<!doctype html><body>Trusted parent</body>')
  await protocol.allowAssetRoot(owned)
  await protocol.allowUserSelectedAsset(join(root, 'selected.html'))
  protocol.registerAssetProtocol()
  const a = await protocol.createWallpaperWebUrl(join(dir, 'index.html'))
  const b = await protocol.createWallpaperWebUrl(join(other, 'index.html'))
  const single = await protocol.createWallpaperWebUrl(join(root, 'selected.html'))
  win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  await win.loadFile(join(root, 'parent.html'))
  await win.webContents.executeJavaScript(`new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.sandbox = 'allow-scripts allow-same-origin';
    frame.onload = () => resolve(true);
    frame.src = ${JSON.stringify(a)};
    document.body.appendChild(frame);
  })`)
  const frame = win.webContents.mainFrame.frames[0]
  const result = await frame.executeJavaScript(`(async () => {
    const blocked = async (url) => { try { const r = await fetch(url); return r.status === 403 } catch { return true } };
    let parentBlocked = false;
    try { void parent.document.body } catch { parentBlocked = true }
    return { ownScript: window.ownScriptLoaded, ownStyle: getComputedStyle(document.body).color,
      ownFetch: (await (await fetch('data.json')).json()).safe,
      parentBlocked, bridgeAbsent: typeof window.wallpaperBridge === 'undefined', nodeAbsent: typeof require === 'undefined',
      crossPackageBlocked: await blocked(${JSON.stringify(new URL('data.json', b).href)}),
      absolutePrivateBlocked: await blocked(${JSON.stringify(protocol.toAssetUrl(join(root, 'private.txt')))}),
      sharedConfigBlocked: await blocked(${JSON.stringify(protocol.toAssetUrl(join(other, 'data.json')))}),
      traversalBlocked: await blocked('..%5cB%5cdata.json'),
      origin: location.origin
    };
  })()`)
  assert.equal(result.ownScript, true)
  assert.equal(result.ownStyle, 'rgb(12, 34, 56)')
  for (const key of ['ownFetch', 'parentBlocked', 'bridgeAbsent', 'nodeAbsent', 'crossPackageBlocked', 'absolutePrivateBlocked', 'sharedConfigBlocked', 'traversalBlocked']) assert.equal(result[key], true, key)
  assert.ok(result.origin.startsWith('lyasset://wp-'), result.origin)
  await win.webContents.executeJavaScript(`new Promise(resolve => { const f = document.querySelector('iframe'); f.onload=()=>resolve(true); f.src=${JSON.stringify(single)} })`)
  const selectedFrame = win.webContents.mainFrame.frames[0]
  const standalone = await selectedFrame.executeJavaScript(`fetch('private.txt').then(r=>r.status===403).catch(()=>true)`)
  assert.equal(standalone, true)
  console.log('SANDBOX_SMOKE_PASS ' + JSON.stringify(result))
}

run().then(() => finish(0), (error) => { console.error(error); return finish(1) })
async function finish(code) {
  clearTimeout(watchdog)
  if (win && !win.isDestroyed()) win.destroy()
  if (root) {
    const rel = relative(resolve(tmpdir()), resolve(root))
    assert.ok(!isAbsolute(rel) && rel.startsWith('lingyue-electron-smoke-') && !rel.includes('..'))
    // Chromium can retain files until process exit. Temp cleanup is best-effort.
    await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }
  app.exit(code)
}
