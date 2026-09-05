import test from 'node:test'
import assert from 'node:assert/strict'
import { createTsLoader, fakeTimers, deferred, tick, plain } from './helpers/load-ts.mjs'
import { widget } from './helpers/desktop-fixture.mjs'
import { getSynchronizedVideoTime, needsVideoTimeCorrection } from '../src/shared/wallpaper-playback.ts'
import { materializeWidgetsForCanvas } from '../src/shared/widget-display-layout.ts'

const load = createTsLoader()
const { parseStoredWidgets, assertWidgetWriteLimits } = load('src/shared/widget-data.ts')

test('stored widget reads preserve oversized legacy config and more than 200 records', () => {
  const items = Array.from({ length: 201 }, (_, i) => widget('w-' + i))
  items[0].config = { legacy: 'x'.repeat(600 * 1024) }
  assert.deepEqual(plain(parseStoredWidgets(items)), items)
  assert.doesNotThrow(() => assertWidgetWriteLimits(items.map((w) => ({ ...w, x: 70 })), items))
})

test('invalid stored records fail closed while new count/config growth and duplicate ids are refused', () => {
  assert.throws(() => parseStoredWidgets([widget(), { id: 'broken' }]), /原数据已保留/)
  const old = Array.from({ length: 200 }, (_, i) => widget('w-' + i))
  assert.throws(() => assertWidgetWriteLimits([...old, widget('extra')], old), /200/)
  assert.throws(() => assertWidgetWriteLimits([widget(), widget()], []), /ID/)
  assert.throws(() => assertWidgetWriteLimits([widget('w', { config: { text: 'x'.repeat(512 * 1024) } })], []), /512KB/)
})

test('debounced writer coalesces timers and flush drains edits arriving during a write in order', async () => {
  const timers = fakeTimers(), gate = deferred(), saved = []
  const create = createTsLoader({ globals: timers.globals })('src/shared/debounced-writer.ts').createDebouncedWriter
  const writer = create(async (value) => { if (value === 2) await gate.promise; saved.push(value) }, assert.fail)
  writer.schedule(1)
  writer.schedule(2)
  assert.equal(timers.tasks.size, 1)
  const flushed = writer.flush()
  await tick()
  writer.schedule(3)
  const secondFlush = writer.flush()
  gate.resolve()
  await Promise.all([flushed, secondFlush])
  assert.deepEqual(saved, [2, 3])
  assert.equal(timers.tasks.size, 0)
})

test('failed debounced writes retain latest data for explicit retry and report timer errors', async () => {
  const timers = fakeTimers(), errors = [], saved = []
  let fail = true
  const { createDebouncedWriter } = createTsLoader({ globals: timers.globals })('src/shared/debounced-writer.ts')
  const writer = createDebouncedWriter(async (value) => { if (fail) throw new Error('disk'); saved.push(value) }, (e) => errors.push(e.message))
  writer.schedule('unsaved')
  timers.fire()
  await tick()
  assert.deepEqual(errors, ['disk'])
  fail = false
  await writer.flush()
  assert.deepEqual(saved, ['unsaved'])
})

test('resource mutation guards protect saved secondary/disconnected assignments and transition reservations', () => {
  const data = { wallpaper: { current: { id: 'A' } }, wallpaperDisplay: { assignments: { secondary: 'B', disconnected: 'C' } } }
  const usage = createTsLoader({ mocks: { '../store': { store: { get: (key) => data[key] } } } })('src/main/services/wallpaper-usage.ts')
  for (const id of ['A', 'B', 'C']) assert.throws(() => usage.beginWallpaperResourceMutation(id), /仍被显示器配置使用/)
  const release1 = usage.reserveWallpaperUsage(['D', 'D']), release2 = usage.reserveWallpaperUsage(['D'])
  release1()
  assert.throws(() => usage.beginWallpaperResourceMutation('D'), /仍被显示器配置使用/)
  release2()
  const finish = usage.beginWallpaperResourceMutation('D')
  assert.throws(() => usage.reserveWallpaperUsage(['D']), /正在更新或删除/)
  assert.throws(() => usage.beginWallpaperResourceMutation('D'), /正在更新或删除/)
  finish()
  usage.reserveWallpaperUsage(['D'])()
})

test('file-operation serialization keeps removal after import, recovers after failure, and does not block other widgets', async () => {
  const { withDesktopIconOperation: run } = load('src/main/services/desktop-icon-operations.ts')
  const gate = deferred(), calls = []
  const a = run('one', async () => { calls.push('import'); await gate.promise; throw new Error('failed') })
  const b = run('one', async () => { calls.push('remove') })
  await run('two', async () => { calls.push('other') })
  assert.deepEqual(calls, ['import', 'other'])
  gate.resolve()
  await assert.rejects(a, /failed/)
  await b
  assert.deepEqual(calls, ['import', 'other', 'remove'])
})

test('off-screen widget projection clamps to reduced work area without mutating saved coordinates', () => {
  const display = { id: 1, key: 'screen', primary: true, bounds: { x: 0, y: 0, width: 1280, height: 720 }, workArea: { x: 0, y: 30, width: 1280, height: 650 } }
  const saved = widget('w', { displayKey: 'screen', x: 2400, y: 1300 })
  const [projected] = materializeWidgetsForCanvas([saved], [display], display.bounds, 'primary')
  assert.ok(projected.x >= 0 && projected.x + projected.width <= 1280)
  assert.ok(projected.y >= 30 && projected.y + projected.height <= 680)
  assert.equal(saved.x, 2400)
  assert.equal(saved.y, 1300)
  assert.deepEqual(materializeWidgetsForCanvas([{ ...saved, displayKey: 'disconnected', displayId: 9 }], [display], display.bounds, 'duplicate'), [])
})

test('shared video clock honors speed/loop and avoids unnecessary seeks at the wrap boundary', () => {
  assert.equal(getSynchronizedVideoTime(1000, 5000, 10, 2), 8)
  assert.equal(getSynchronizedVideoTime(1000, 7000, 10, 2), 2)
  assert.equal(getSynchronizedVideoTime(5000, 1000, 10, 1), 0)
  assert.equal(getSynchronizedVideoTime(0, 2000, NaN, 1), undefined)
  assert.equal(needsVideoTimeCorrection(9.98, 0.01, 10), false)
  assert.equal(needsVideoTimeCorrection(2, 3, 10), true)
})

test('weather polling replaces fake data with loading/error, retries, then retains stale last-good snapshot', async () => {
  const timers = fakeTimers(), states = []
  const polling = createTsLoader({ globals: timers.globals })('src/shared/weather-polling.ts')
  let value
  const controller = polling.startWeatherPolling(async () => value, (state) => states.push(plain(state)))
  assert.equal(states[0].status, 'loading')
  assert.equal(states[0].snapshot, undefined)
  await tick()
  assert.equal(states.at(-1).status, 'error')
  assert.equal([...timers.tasks.values()][0].delay, polling.WEATHER_RETRY_MS)
  value = { ok: true, current: { temperature: 16 }, city: 'Test' }
  timers.fire()
  await tick()
  assert.equal(states.at(-1).status, 'ready')
  assert.equal([...timers.tasks.values()][0].delay, polling.WEATHER_REFRESH_MS)
  value = undefined
  timers.fire()
  await tick()
  assert.equal(states.at(-1).status, 'stale')
  assert.equal(states.at(-1).snapshot.current.temperature, 16)
  controller.stop()
  assert.equal(timers.tasks.size, 0)
})

test('weather polling prevents overlap and ignores late responses after disposal/city change', async () => {
  const timers = fakeTimers(), gate = deferred(), states = []
  let calls = 0
  const { startWeatherPolling } = createTsLoader({ globals: timers.globals })('src/shared/weather-polling.ts')
  const controller = startWeatherPolling(() => { calls++; return gate.promise }, (s) => states.push(s))
  await controller.refresh()
  assert.equal(calls, 1)
  controller.stop()
  gate.resolve({ ok: true, current: { temperature: 25 } })
  await tick()
  assert.equal(states.length, 1)
  assert.equal(timers.tasks.size, 0)
})
