import assert from 'node:assert/strict'
import fs, { promises as files } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createTsLoader, fakeTimers, plain } from './load-ts.mjs'

const { structuredClone, Request, Response } = globalThis

export const widget = (id = 'clock-1', extra = {}) => ({
  id, type: 'clock', x: 20, y: 20, width: 320, height: 180, enabled: true, ...extra,
})
export const displays = [
  { id: 101, key: 'win32:one', primary: true, scaleFactor: 1.5, label: 'One',
    bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1400 } },
  { id: 202, key: 'win32:two', primary: false, scaleFactor: 1, label: 'Two',
    bounds: { x: -1920, y: 100, width: 1920, height: 1080 }, workArea: { x: -1920, y: 100, width: 1920, height: 1040 } },
]

export async function desktopFixture(t, { initial = {}, realIcons = false } = {}) {
  const root = await files.mkdtemp(join(tmpdir(), 'lingyue-regression-'))
  const userData = join(root, 'userData')
  const builtin = join(root, 'assets/wallpaper')
  const mainDir = join(root, 'out/main')
  await Promise.all([userData, builtin, mainDir, join(root, 'Desktop')].map((p) => files.mkdir(p, { recursive: true })))
  t.after(async () => {
    const rel = relative(resolve(tmpdir()), resolve(root))
    assert.ok(!isAbsolute(rel) && rel.startsWith('lingyue-regression-') && !rel.includes('..'))
    await files.rm(root, { recursive: true, force: true })
  })
  const state = { widgets: [], globalIconWidgets: [], wallpaper: {}, wallpaperDisplay: { mode: 'primary', assignments: {} }, ...structuredClone(initial) }
  const writes = []
  const store = {
    get: (key) => structuredClone(state[key]),
    set(key, value) {
      const update = typeof key === 'object' ? key : { [key]: value }
      writes.push(structuredClone(update))
      Object.assign(state, structuredClone(update))
    },
  }
  const timers = fakeTimers()
  const app = new EventEmitter()
  app.isPackaged = false
  app.getPath = (key) => key === 'userData' ? userData : key === 'desktop' ? join(root, 'Desktop') : root
  app.getFileIcon = async () => ({ isEmpty: () => true })
  app.quit = () => { app.quitCalls = (app.quitCalls ?? 0) + 1 }
  const screen = new EventEmitter()
  const handlers = new Map(), listeners = new Map(), requests = new Map(), messages = [], dialogs = []
  const controls = {
    displays: structuredClone(displays), failWrite: false, restore: async () => ({ ok: true, skipped: [], restoredItemIds: [] }),
    pickedFile: undefined,
  }
  const makeWindow = (id) => ({
    isDestroyed: () => false,
    webContents: { id, isDestroyed: () => false, isLoading: () => false,
      send: (channel, ...args) => messages.push({ id, channel, args: plain(args) }),
      setAudioMuted: (value) => messages.push({ id, muted: value }),
    },
  })
  const canvas = makeWindow(1), main = makeWindow(2), wallpapers = [makeWindow(101), makeWindow(202)]
  let layout
  const mockFs = { ...fs, promises: { ...files, writeFile: async (...args) => {
    if (controls.failWrite && String(args[0]).endsWith('.tmp')) throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' })
    return files.writeFile(...args)
  } } }
  const mocks = {
    fs: mockFs,
    electron: {
      app, screen, ipcMain: { handle: (key, fn) => handlers.set(key, fn), on: (key, fn) => listeners.set(key, fn) },
      dialog: { showMessageBox: async (v) => { dialogs.push(v); return { response: 0 } }, showErrorBox: (...v) => dialogs.push(v),
        showOpenDialog: async () => ({ canceled: !controls.pickedFile, filePaths: controls.pickedFile ? [controls.pickedFile] : [] }) },
      protocol: { handle: (key, fn) => requests.set(key, fn), registerSchemesAsPrivileged: () => {} },
      net: { fetch: async (url) => new Response(await files.readFile(fileURLToPath(url))) },
      Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
      shell: { readShortcutLink: () => { throw new Error('not a shortcut') } },
    },
    '../store': { store },
    './ipcSecurity': { assertTrustedIpcSender: () => {} },
    '../runtime/diagnosticLog': { logDockDiagnostic: () => {} },
    '../windows/foregroundAppWindow': {},
    '../windows/mainWindow': { getMainWindow: () => main },
    '../windows/canvasWindow': { getCanvasWindow: () => canvas, isCanvasEditMode: () => false,
      setCanvasMousePassthrough: () => {}, refreshCanvasBounds: () => {}, refreshCanvasZOrder: () => {}, isDesktopOccluded: () => false },
    '../windows/displayLayout': { WALLPAPER_DISPLAY_SCHEMA_VERSION: 2, getDisplayDescriptors: () => controls.displays,
      getWallpaperDisplayMode: () => state.wallpaperDisplay.mode,
      getDesktopRenderBounds: () => state.wallpaperDisplay.mode === 'primary'
        ? (controls.displays.find((d) => d.primary) ?? controls.displays[0]).bounds : layout.unionDisplayBounds(controls.displays) },
    '../windows/wallpaperWindow': { getWallpaperWindows: () => wallpapers.filter((w) => layout.getWallpaperWindowTargets(state.wallpaperDisplay.mode, controls.displays).some((d) => d.displayId === w.webContents.id)),
      getWallpaperWindowTarget: (id) => layout.getWallpaperWindowTargets(state.wallpaperDisplay.mode, controls.displays).find((d) => d.displayId === id),
      isWallpaperAttached: () => true, isWallpaperWebContents: (id) => [101, 202].includes(id),
      refreshWallpaperBounds: () => {}, ensureWallpaperAttached: async () => true },
  }
  if (!realIcons) mocks['./desktopIconIpc'] = {
    getDesktopIconItems: (w) => w.config?.items ?? [], restoreDesktopIconsForWidget: (...args) => controls.restore(...args),
  }
  const load = createTsLoader({ mocks, globals: timers.globals, mainDir })
  layout = load('src/shared/wallpaper-display-layout.ts')
  const IPC = load('src/shared/ipc-channels.ts').IPC
  const paths = load('src/main/runtime/userDataPaths.ts')
  const protocol = load('src/main/protocols.ts')
  for (const path of [builtin, paths.getUserWallpapersRoot(), paths.getRemoteWallpapersRoot()]) {
    await files.mkdir(path, { recursive: true })
    await protocol.allowAssetRoot(path)
  }
  protocol.registerAssetProtocol()
  const widgets = load('src/main/ipc/widgetIpc.ts')
  const wallpaper = load('src/main/ipc/wallpaperIpc.ts')
  widgets.registerWidgetIpc()
  wallpaper.registerWallpaperIpc()
  if (realIcons) load('src/main/ipc/desktopIconIpc.ts').registerDesktopIconIpc()
  const invoke = (channel, ...args) => handlers.get(IPC[channel])({ sender: main.webContents }, ...args)
  async function addWallpaper(id, config = [], type = 'image') {
    const dir = id.startsWith('user:') ? join(paths.getUserWallpapersRoot(), id.slice(5))
      : id.startsWith('remote:') ? join(paths.getRemoteWallpapersRoot(), id.slice(7)) : join(builtin, id)
    await files.mkdir(dir, { recursive: true })
    const file = type === 'web' ? 'index.html' : type === 'video' ? 'wallpaper.mp4' : 'wallpaper.png'
    await files.writeFile(join(dir, file), type === 'web' ? '<html>fixture</html>' : 'fixture')
    await files.writeFile(join(dir, 'preview.png'), 'fixture')
    await files.writeFile(join(dir, 'FlowWallDeskInfo.json'), JSON.stringify({ Title: id, Type: type === 'web' ? 1 : type === 'video' ? 7 : 11, FileName: file, Thumbnail: 'preview.png', Settings: { volume: 50, speed: 1 } }))
    await files.writeFile(join(dir, 'widget-config.json'), JSON.stringify({ widgets: config, coordinateSpace: 'display-local-v1' }))
    return { id, name: id, type, source: join(dir, file), settings: { volume: 50, speed: 1 } }
  }
  return { root, userData, builtin, state, store, writes, controls, timers, app, screen, dialogs, messages, handlers, listeners, IPC,
    load, paths, protocol, widgets, wallpaper, invoke, addWallpaper,
    request: (url, origin) => requests.get('lyasset')(new Request(url, origin ? { headers: { Origin: origin } } : {})),
  }
}
