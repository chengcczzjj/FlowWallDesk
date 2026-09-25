import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

import {
  classifyNativeCursorSurface,
  findInteractiveWidgetAtPoint,
  sanitizeCanvasHitRegions,
  shouldIgnoreCanvasMouse,
} from '../src/shared/canvas-hit-test.ts'
import {
  clampRectPartiallyIntoArea,
  fitWidgetsIntoDisplays,
  isRectReachable,
  pickDisplayForRect,
} from '../src/shared/widget-display-fit.ts'
import {
  getWallpaperFrame,
  getWallpaperFrameSources,
  setWallpaperFrameSources,
  subscribeWallpaperFrameSources,
} from '../src/renderer/canvas/wallpaperFrameStore.ts'

// Secondary 1080p monitor to the left of a taller primary, offset downwards.
// Canvas coordinates: union origin is (-1920, 0) in screen space.
const displays = [
  {
    primary: true,
    bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    workArea: { x: 1920, y: 0, width: 2560, height: 1392 },
  },
  {
    primary: false,
    bounds: { x: 0, y: 180, width: 1920, height: 1080 },
    workArea: { x: 0, y: 180, width: 1920, height: 1040 },
  },
]

test('renderer hit regions are validated before they route native input', () => {
  const region = { id: 'note-1', type: 'todo-board', x: 10, y: 20, width: 220, height: 190, stackOrder: 3 }
  assert.deepEqual(sanitizeCanvasHitRegions([region]), [region])
  // Empty rectangles are skipped, malformed payloads are rejected as a whole.
  assert.deepEqual(sanitizeCanvasHitRegions([{ ...region, width: 0 }]), [])
  assert.equal(sanitizeCanvasHitRegions([{ ...region, x: Number.NaN }]), null)
  assert.equal(sanitizeCanvasHitRegions([{ ...region, id: '' }]), null)
  assert.equal(sanitizeCanvasHitRegions('nope'), null)
  assert.equal(sanitizeCanvasHitRegions(Array.from({ length: 201 }, () => region)), null)

  // A rotated note's measured footprint extends past its persisted rect.
  const persisted = { ...region, x: 100, y: 100, enabled: true }
  const measured = { ...region, x: 96, y: 98, width: 228, height: 196 }
  const canvas = { x: 0, y: 0, width: 1920, height: 1080 }
  assert.equal(findInteractiveWidgetAtPoint({ x: 97, y: 150 }, canvas, [persisted]), undefined)
  assert.equal(findInteractiveWidgetAtPoint({ x: 97, y: 150 }, canvas, [measured])?.id, 'note-1')
})

test('widgets covered by another window never make the canvas capture the mouse', () => {
  assert.equal(classifyNativeCursorSurface({ hitHwnd: 5, canvasTopmost: true, desktopSurface: false }), 'canvas')
  assert.equal(classifyNativeCursorSurface({ hitHwnd: 5, canvasTopmost: false, desktopSurface: true }), 'desktop')
  assert.equal(classifyNativeCursorSurface({ hitHwnd: 9, canvasTopmost: false, desktopSurface: false }), 'foreign')
  assert.equal(classifyNativeCursorSurface({ hitHwnd: 0, canvasTopmost: false, desktopSurface: false }), 'unknown')

  const base = { desktopOccluded: false, editing: false, pointerActive: false, widgetUnderCursor: true }
  assert.equal(shouldIgnoreCanvasMouse(base), false)
  assert.equal(shouldIgnoreCanvasMouse({ ...base, cursorCovered: true }), true)
  // A drag that started on the canvas keeps capture while passing under an app.
  assert.equal(shouldIgnoreCanvasMouse({ ...base, cursorCovered: true, pointerActive: true }), false)
  assert.equal(shouldIgnoreCanvasMouse({ ...base, cursorCovered: true, editing: true }), false)
})

test('widgets are assigned to the monitor under their centre, not the union rectangle', () => {
  assert.equal(pickDisplayForRect({ x: 2000, y: 100, width: 200, height: 200 }, displays), displays[0])
  assert.equal(pickDisplayForRect({ x: 1800, y: 400, width: 200, height: 200 }, displays), displays[1])
  // Dead zone above the offset secondary monitor belongs to the nearest monitor.
  assert.equal(pickDisplayForRect({ x: 200, y: 0, width: 100, height: 60 }, displays), displays[1])
  assert.equal(isRectReachable({ x: 200, y: 0, width: 100, height: 60 }, displays), false)
  assert.equal(isRectReachable({ x: 1900, y: 400, width: 200, height: 200 }, displays), true)
})

test('off-screen widgets are pulled back onto the nearest monitor work area', () => {
  const widgets = [
    { id: 'visible', x: 2100, y: 60, width: 320, height: 160 },
    { id: 'dead-zone', x: 300, y: 0, width: 320, height: 120 },
    { id: 'removed-monitor', x: 5200, y: 300, width: 320, height: 160 },
  ]
  const { widgets: fitted, movedIds } = fitWidgetsIntoDisplays(widgets, displays, { edgePadding: 24 })
  assert.deepEqual(movedIds, ['dead-zone', 'removed-monitor'])
  assert.deepEqual(fitted[0], widgets[0])
  assert.deepEqual({ x: fitted[1].x, y: fitted[1].y }, { x: 300, y: 204 })
  assert.deepEqual({ x: fitted[2].x, y: fitted[2].y }, { x: 4480 - 24 - 320, y: 300 })
})

test('free-form sticky notes may hang over a monitor edge but stay grabbable', () => {
  const area = displays[0].bounds
  assert.deepEqual(
    clampRectPartiallyIntoArea({ x: 4470, y: -300, width: 220, height: 190 }, area, 42),
    { x: 4480 - 42, y: -190 + 42 },
  )
  assert.deepEqual(clampRectPartiallyIntoArea({ x: 2000, y: 200, width: 220, height: 190 }, area, 42), { x: 2000, y: 200 })
})

test('wallpaper frame sources replace stale monitors and drop their frames', () => {
  let notified = 0
  const unsubscribe = subscribeWallpaperFrameSources(() => { notified += 1 })
  setWallpaperFrameSources([
    { key: 'display:1', bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    { key: 'display:2', bounds: { x: 0, y: 180, width: 1920, height: 1080 } },
    { key: 'broken', bounds: { x: 0, y: 0, width: 0, height: 10 } },
  ])
  assert.deepEqual(getWallpaperFrameSources().map((source) => source.key), ['display:1', 'display:2'])
  assert.equal(notified, 1)
  // Identical updates do not notify listeners again.
  setWallpaperFrameSources([
    { key: 'display:1', bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    { key: 'display:2', bounds: { x: 0, y: 180, width: 1920, height: 1080 } },
  ])
  assert.equal(notified, 1)
  setWallpaperFrameSources([{ key: 'span', bounds: { x: 0, y: 0, width: 4480, height: 1440 } }])
  assert.deepEqual(getWallpaperFrameSources().map((source) => source.key), ['span'])
  assert.equal(getWallpaperFrame('display:1'), null)
  assert.equal(notified, 2)
  unsubscribe()
})

test('display topology preview keeps every monitor at its real aspect ratio', async () => {
  const { layoutDisplayTopology, formatDisplayResolution, getDisplayModeOption } = await import('../src/shared/display-topology.ts')
  const single = layoutDisplayTopology([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }], { width: 800, height: 220 }, 18)
  const ratio = single[0].rect.width / single[0].rect.height
  assert.ok(Math.abs(ratio - 16 / 9) < 0.08, `16:9 monitor drawn at ${ratio.toFixed(2)}:1`)
  // Centred horizontally inside the preview box.
  assert.ok(Math.abs(single[0].rect.left + single[0].rect.width / 2 - 400) <= 2)

  const portraitAndLandscape = layoutDisplayTopology([
    { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } },
    { id: 2, bounds: { x: 2560, y: -240, width: 1080, height: 1920 } },
  ], { width: 800, height: 220 }, 18)
  const portrait = portraitAndLandscape[1].rect
  assert.ok(portrait.height > portrait.width, 'portrait monitor must stay portrait')
  // Neighbouring monitors never overlap.
  const landscape = portraitAndLandscape[0].rect
  assert.ok(landscape.left + landscape.width <= portrait.left)

  assert.equal(formatDisplayResolution({ bounds: { x: 0, y: 0, width: 1707, height: 960 }, scaleFactor: 1.5 }), '2561 × 1440')
  assert.equal(getDisplayModeOption('span').label, '跨屏延展')
})

test('desktop layer contracts: covered widgets, DOM hit regions, quiet z-order and per-window glass', async () => {
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const [canvasWindow, mainIndex, wallpaperIpc, widgetIpc, canvasRenderer, canvasCss] = await Promise.all([
    read('src/main/windows/canvasWindow.ts'),
    read('src/main/index.ts'),
    read('src/main/ipc/wallpaperIpc.ts'),
    read('src/main/ipc/widgetIpc.ts'),
    read('src/renderer/canvas/Canvas.tsx'),
    read('src/renderer/canvas/canvas.css'),
  ])

  // Native hit testing uses what the renderer painted, and ignores widgets another window covers.
  assert.match(canvasWindow, /findInteractiveWidgetAtPoint\(cursor, displayBounds, getCanvasHitCandidates\(\)\)/)
  assert.match(canvasWindow, /cursorCovered: cursorSurfaceCovered/)
  assert.match(canvasWindow, /const covered = !rendererPointerActive && isCoveredCursorSurface\(widgetSurface\)/)
  assert.match(canvasWindow, /export function setCanvasMousePassthrough[\s\S]*isCoveredCursorSurface\(inspectNativeCursorSurface\(\)\)/)
  assert.match(canvasRenderer, /setHitRegions\?\.\(regions\)/)
  assert.match(canvasRenderer, /dataset\.pointerOccluded = 'true'/)
  assert.match(canvasCss, /html\[data-pointer-occluded='true'\] body \* \{\s*pointer-events: none !important;/)

  // Chromium's native occlusion tracker is what kept marking the bottom-most canvas stale.
  assert.match(mainIndex, /appendSwitch\('disable-features', 'CalculateNativeWinOcclusion'\)/)

  // Applying a wallpaper no longer flashes the canvas above every window.
  const applyHandler = wallpaperIpc.slice(
    wallpaperIpc.indexOf('ipcMain.handle(IPC.WALLPAPER_APPLY'),
    wallpaperIpc.indexOf('IPC.WALLPAPER_SAVE_SETTINGS'),
  )
  assert.doesNotMatch(applyHandler, /refreshCanvasZOrder\(\)/)
  // Live wallpaper setting changes are not immediately overwritten by a stale layout.
  const updateSettingHandler = wallpaperIpc.slice(
    wallpaperIpc.indexOf('IPC.WALLPAPER_UPDATE_SETTING,'),
    wallpaperIpc.indexOf('IPC.WALLPAPER_PICK_FILE'),
  )
  assert.doesNotMatch(updateSettingHandler, /broadcastWallpaperDisplayLayout\(\)/)

  // Glass frames are relayed per wallpaper window; static images are not re-captured forever.
  assert.match(wallpaperIpc, /safeSendToWindow\(getCanvasWindow\(\), IPC\.WALLPAPER_FRAME, \{ key: target\.key, data \}\)/)
  assert.match(wallpaperIpc, /if \(state\?\.mediaType === 'image'\) return false/)

  // Widget configs are stored relative to the primary monitor; the Dock sits on the primary work area.
  assert.match(widgetIpc, /coordinateSpace: WIDGET_CONFIG_COORDINATE_SPACE/)
  assert.match(widgetIpc, /function getDockPlacement[\s\S]*getPrimaryWorkArea\(\)/)
  assert.match(widgetIpc, /ensureWidgetCoordinateOrigin\(\{ fit: 'none', sync: false \}\)/)
})
