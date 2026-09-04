import assert from 'node:assert/strict'
import test from 'node:test'
import {
  materializeWidgetsForCanvas,
  migrateLegacyWidgetToDisplay,
  persistWidgetFromCanvas,
} from '../src/shared/widget-display-layout.ts'

const displays = [
  {
    id: 101,
    key: 'win32:display1',
    label: '显示器 1',
    primary: true,
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    workArea: { x: 0, y: 0, width: 2560, height: 1392 },
    scaleFactor: 1.5,
  },
  {
    id: 202,
    key: 'win32:display2',
    label: '显示器 2',
    primary: false,
    bounds: { x: -1920, y: 180, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 180, width: 1920, height: 1040 },
    scaleFactor: 1,
  },
]

const baseWidget = {
  id: 'clock-1',
  type: 'clock',
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  enabled: true,
}

test('legacy virtual-canvas coordinates migrate to the owning display', () => {
  const primary = migrateLegacyWidgetToDisplay(
    { ...baseWidget, x: 2100, y: 300 },
    { x: -1920, y: 0 },
    displays,
  )
  assert.equal(primary.displayKey, 'win32:display1')
  assert.deepEqual({ x: primary.x, y: primary.y }, { x: 180, y: 300 })

  const secondary = migrateLegacyWidgetToDisplay(
    { ...baseWidget, id: 'clock-2', x: 100, y: 280 },
    { x: -1920, y: 0 },
    displays,
  )
  assert.equal(secondary.displayKey, 'win32:display2')
  assert.deepEqual({ x: secondary.x, y: secondary.y }, { x: 100, y: 100 })
})

test('display-local widget positions do not change when the canvas mode changes', () => {
  const widgets = [
    { ...baseWidget, x: 180, y: 300, displayId: 101, displayKey: 'win32:display1' },
    { ...baseWidget, id: 'clock-2', x: 100, y: 100, displayId: 202, displayKey: 'win32:display2' },
  ]
  const virtual = { x: -1920, y: 0, width: 4480, height: 1440 }
  const multi = materializeWidgetsForCanvas(widgets, displays, virtual, 'per-display')
  assert.deepEqual(multi.map(({ x, y }) => ({ x, y })), [{ x: 2100, y: 300 }, { x: 100, y: 280 }])

  const primary = materializeWidgetsForCanvas(widgets, displays, displays[0].bounds, 'primary')
  assert.equal(primary.length, 1)
  assert.deepEqual({ x: primary[0].x, y: primary[0].y }, { x: 180, y: 300 })
  assert.deepEqual(widgets.map(({ x, y }) => ({ x, y })), [{ x: 180, y: 300 }, { x: 100, y: 100 }])
})

test('dragging across monitors changes the stable display binding and keeps local position', () => {
  const virtual = { x: -1920, y: 0, width: 4480, height: 1440 }
  const persisted = persistWidgetFromCanvas(
    { ...baseWidget, x: 120, y: 300, displayId: 101, displayKey: 'win32:display1' },
    displays,
    virtual,
    'per-display',
  )
  assert.equal(persisted.displayKey, 'win32:display2')
  assert.equal(persisted.displayId, 202)
  assert.deepEqual({ x: persisted.x, y: persisted.y }, { x: 120, y: 120 })
})

test('stable display keys survive Electron id changes', () => {
  const changedIds = displays.map((display, index) => ({ ...display, id: 900 + index }))
  const widgets = [{ ...baseWidget, x: 100, y: 100, displayId: 202, displayKey: 'win32:display2' }]
  const virtual = { x: -1920, y: 0, width: 4480, height: 1440 }
  const materialized = materializeWidgetsForCanvas(widgets, changedIds, virtual, 'per-display')
  assert.equal(materialized[0].displayId, 901)
  assert.deepEqual({ x: materialized[0].x, y: materialized[0].y }, { x: 100, y: 280 })
})
