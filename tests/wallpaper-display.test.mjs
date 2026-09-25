import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import {
  buildWallpaperLayoutForTarget,
  getWallpaperWindowTargets,
  normalizeWallpaperDisplayMode,
  planWallpaperApplication,
  resolveWallpaperObjectFit,
  unionDisplayBounds,
} from '../src/shared/wallpaper-display-layout.ts'

const displays = [
  {
    id: 101,
    key: 'win32:display1',
    label: '显示器 1',
    name: 'Primary 4K',
    primary: true,
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    workArea: { x: 0, y: 0, width: 2560, height: 1392 },
    scaleFactor: 1.5,
  },
  {
    id: 202,
    key: 'win32:display2',
    label: '显示器 2',
    name: 'Secondary FHD',
    primary: false,
    bounds: { x: -1920, y: 180, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 180, width: 1920, height: 1040 },
    scaleFactor: 1,
  },
]

const current = { id: 'current', name: 'Current', source: 'current.mp4', type: 'video' }
const secondary = { id: 'secondary', name: 'Secondary', source: 'secondary.jpg', type: 'image' }

test('duplicate and per-display modes create one native window per monitor', () => {
  for (const mode of ['duplicate', 'per-display']) {
    const targets = getWallpaperWindowTargets(mode, displays)
    assert.equal(targets.length, 2)
    assert.deepEqual(targets.map((target) => target.key), ['display:win32:display1', 'display:win32:display2'])
    assert.deepEqual(targets.map((target) => target.bounds), displays.map((display) => display.bounds))
  }

  const primaryTargets = getWallpaperWindowTargets('primary', displays)
  assert.equal(primaryTargets.length, 1)
  assert.equal(primaryTargets[0].displayId, 101)
})

test('span uses monitor-local windows and crops one virtual composition', () => {
  assert.deepEqual(unionDisplayBounds(displays), { x: -1920, y: 0, width: 4480, height: 1440 })
  const targets = getWallpaperWindowTargets('span', displays)
  assert.equal(targets.length, 2)
  assert.deepEqual(targets.map((target) => target.bounds), displays.map((display) => display.bounds))

  const primaryLayout = buildWallpaperLayoutForTarget({
    mode: 'span',
    target: targets[0],
    displays,
    assignments: {},
    catalog: [current],
    current,
  })
  const secondaryLayout = buildWallpaperLayoutForTarget({
    mode: 'span',
    target: targets[1],
    displays,
    assignments: {},
    catalog: [current],
    current,
  })
  assert.deepEqual(primaryLayout.virtualBounds, { x: -1920, y: 0, width: 4480, height: 1440 })
  assert.deepEqual(primaryLayout.displays[0].localBounds, { x: -1920, y: 0, width: 4480, height: 1440 })
  assert.deepEqual(secondaryLayout.displays[0].localBounds, { x: 0, y: -180, width: 4480, height: 1440 })
})

test('span always covers the virtual desktop regardless of saved wallpaper scaling', () => {
  assert.equal(resolveWallpaperObjectFit('span', '居中'), 'cover')
  assert.equal(resolveWallpaperObjectFit('span', '填充'), 'cover')
  assert.equal(resolveWallpaperObjectFit('span', '自由'), 'cover')

  assert.equal(resolveWallpaperObjectFit('per-display', '居中'), 'none')
  assert.equal(resolveWallpaperObjectFit('duplicate', '填充'), 'contain')
  assert.equal(resolveWallpaperObjectFit('primary', '拉伸'), 'fill')
})

test('persisted display modes remain authoritative and invalid legacy values fall back safely', () => {
  for (const mode of ['primary', 'duplicate', 'per-display', 'span']) {
    assert.equal(normalizeWallpaperDisplayMode(mode), mode)
  }
  assert.equal(normalizeWallpaperDisplayMode('unknown'), 'primary')
  assert.equal(normalizeWallpaperDisplayMode(undefined), 'primary')
})

test('per-display layouts resolve independent assignments in window-local coordinates', () => {
  const targets = getWallpaperWindowTargets('per-display', displays)
  const primaryLayout = buildWallpaperLayoutForTarget({
    mode: 'per-display',
    target: targets[0],
    displays,
    assignments: { 202: secondary.id },
    catalog: [current, secondary],
    current,
  })
  const secondaryLayout = buildWallpaperLayoutForTarget({
    mode: 'per-display',
    target: targets[1],
    displays,
    assignments: { 202: secondary.id },
    catalog: [current, secondary],
    current,
  })

  assert.equal(primaryLayout.displays[0].item.id, current.id)
  assert.equal(secondaryLayout.displays[0].item.id, secondary.id)
  assert.deepEqual(secondaryLayout.virtualBounds, displays[1].bounds)
  assert.deepEqual(secondaryLayout.displays[0].localBounds, { x: 0, y: 0, width: 1920, height: 1080 })
})

test('single-monitor targeting preserves other screens and legacy all-targeting assigns every screen', () => {
  const secondaryPlan = planWallpaperApplication({
    target: 202,
    mode: 'span',
    assignments: {},
    displays,
    currentId: current.id,
    itemId: secondary.id,
  })
  assert.equal(secondaryPlan.mode, 'per-display')
  assert.equal(secondaryPlan.currentId, current.id)
  assert.deepEqual(secondaryPlan.assignments, { 'win32:display1': current.id, 'win32:display2': secondary.id })

  const allPlan = planWallpaperApplication({
    target: 'all',
    mode: 'span',
    assignments: secondaryPlan.assignments,
    displays,
    currentId: current.id,
    itemId: secondary.id,
  })
  assert.equal(allPlan.mode, 'per-display')
  assert.equal(allPlan.currentId, secondary.id)
  assert.deepEqual(allPlan.assignments, { 'win32:display1': secondary.id, 'win32:display2': secondary.id })
})

test('applying to the current layout preserves duplicate and span modes', () => {
  for (const mode of ['primary', 'duplicate', 'span']) {
    const plan = planWallpaperApplication({
      target: 'current',
      mode,
      assignments: { 101: current.id, 202: secondary.id },
      displays,
      currentId: current.id,
      itemId: secondary.id,
    })
    assert.equal(plan.mode, mode)
    assert.equal(plan.currentId, secondary.id)
    assert.deepEqual(plan.assignments, { 101: current.id, 202: secondary.id })
  }
})

test('main and renderer callers do not bypass the persisted display mode', async () => {
  const [displayLayoutSource, wallpaperIpcSource, appSource, librarySource, onlineLibrarySource] = await Promise.all([
    readFile(new URL('../src/main/windows/displayLayout.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main/ipc/wallpaperIpc.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/main-ui/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/main-ui/pages/LibraryPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/main-ui/pages/OnlineWallpaperPage.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(displayLayoutSource, /normalizeWallpaperDisplayMode\(store\.get\('wallpaperDisplay'\)\?\.mode\)/)
  assert.doesNotMatch(displayLayoutSource, /getWallpaperDisplayMode[\s\S]{0,200}return 'per-display'/)
  assert.match(wallpaperIpcSource, /const mode = normalizeWallpaperDisplayMode\(settings\?\.mode\)/)
  assert.match(wallpaperIpcSource, /commitWallpaperDisplay\(\{ \.\.\.store\.get\('wallpaperDisplay'\), mode,/ )
  assert.match(wallpaperIpcSource, /store\.set\(\{ wallpaper: [^\n]+wallpaperDisplay: settings \}\)/)
  assert.match(appSource, /displaySettings\?\.mode === 'per-display'[\s\S]{0,100}\? wallpaperTarget[\s\S]{0,50}: 'current'/)
  assert.match(appSource, /<DisplaySettingsPage \/>/)
  assert.match(librarySource, /activeMode === 'per-display'[\s\S]{0,120}\? activeDisplayId[\s\S]{0,50}: 'current'/)
  assert.match(onlineLibrarySource, /getDisplayAssignment\(displaySettings\.assignments, targetDisplay\)/)
  assert.doesNotMatch(onlineLibrarySource, /assignments\[String\(wallpaperTarget\)\]/)
})

test('native attachment and glass capture keep monitor-local runtime contracts', async () => {
  const [identitySource, attachSource, wallpaperIpcSource, wallpaperRendererSource, frameStoreSource, glassSource] = await Promise.all([
    readFile(new URL('../src/main/windows/nativeDisplayIdentity.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main/windows/attachWallpaperNative.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main/ipc/wallpaperIpc.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/wallpaper/Wallpaper.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/canvas/wallpaperFrameStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/renderer/widgets/FrostedGlassBackground.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(identitySource, /GetMonitorInfoW[\s\S]{0,180}koffi\.inout\(koffi\.pointer\(monitorInfo\)\)/)
  assert.match(attachSource, /\(style \| WS_CHILD\) & ~WS_POPUP/)
  assert.match(attachSource, /ScreenToClient\(parent, parentPoint\)/)
  assert.match(wallpaperIpcSource, /if \(!isWallpaperWebContents\(_e\.sender\.id\)\) return/)
  assert.match(wallpaperIpcSource, /sendToWallpaperWindows\(IPC\.WALLPAPER_CAPTURE_DEMAND, enabled\)/)
  assert.match(wallpaperIpcSource, /const payload: WallpaperFramePayload = \{[\s\S]{0,180}displayKey: target\.displayKey/)
  assert.match(wallpaperRendererSource, /layout\?\.displays\[0\]\?\.localBounds/)
  assert.match(frameStoreSource, /currentFrames = new Map<string, ProcessedWallpaperFrame>/)
  assert.match(glassSource, /getWallpaperFrameAt\(widgetX, widgetY\)/)
  assert.match(glassSource, /selected\.bounds\.x - widgetX/)
})
