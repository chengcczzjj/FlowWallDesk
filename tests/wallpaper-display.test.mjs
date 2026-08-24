import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWallpaperLayoutForTarget,
  getWallpaperWindowTargets,
  planWallpaperApplication,
  unionDisplayBounds,
} from '../src/shared/wallpaper-display-layout.ts'

const displays = [
  {
    id: 101,
    label: '显示器 1',
    name: 'Primary 4K',
    primary: true,
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    workArea: { x: 0, y: 0, width: 2560, height: 1392 },
    scaleFactor: 1.5,
  },
  {
    id: 202,
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
    assert.deepEqual(targets.map((target) => target.key), ['display:101', 'display:202'])
    assert.deepEqual(targets.map((target) => target.bounds), displays.map((display) => display.bounds))
  }

  const primaryTargets = getWallpaperWindowTargets('primary', displays)
  assert.equal(primaryTargets.length, 1)
  assert.equal(primaryTargets[0].displayId, 101)
})

test('span is the only mode that creates a virtual-desktop window', () => {
  assert.deepEqual(unionDisplayBounds(displays), { x: -1920, y: 0, width: 4480, height: 1440 })
  const targets = getWallpaperWindowTargets('span', displays)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].kind, 'span')
  assert.deepEqual(targets[0].bounds, { x: -1920, y: 0, width: 4480, height: 1440 })
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

test('single-monitor targeting preserves other screens and all-monitor targeting selects duplicate mode', () => {
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
  assert.deepEqual(secondaryPlan.assignments, { 101: current.id, 202: secondary.id })

  const allPlan = planWallpaperApplication({
    target: 'all',
    mode: 'span',
    assignments: secondaryPlan.assignments,
    displays,
    currentId: current.id,
    itemId: secondary.id,
  })
  assert.equal(allPlan.mode, 'duplicate')
  assert.equal(allPlan.currentId, secondary.id)
})
