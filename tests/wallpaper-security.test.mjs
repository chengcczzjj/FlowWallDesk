import test from 'node:test'
import { URL } from 'node:url'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { promises as fs, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { ZipFile } from 'yazl'
import { desktopFixture } from './helpers/desktop-fixture.mjs'

async function zip(path, entries) {
  await new Promise((resolve, reject) => {
    const out = createWriteStream(path), archive = new ZipFile()
    out.on('close', resolve).on('error', reject)
    archive.outputStream.on('error', reject).pipe(out)
    for (const [name, content] of Object.entries(entries)) archive.addBuffer(Buffer.from(content), name)
    archive.end()
  })
}
const meta = (name) => ({ name, desc: '', author: '', contact: '' })

test('standalone HTML authorization grants only the selected entry, never its parent folder', async (t) => {
  const f = await desktopFixture(t)
  const entry = join(f.root, 'selected.html'), secret = join(f.root, 'private.txt')
  await fs.writeFile(entry, '<h1>safe fixture</h1>')
  await fs.writeFile(secret, 'synthetic private data')
  await f.protocol.allowUserSelectedAsset(entry)
  const url = await f.protocol.createWallpaperWebUrl(entry)
  assert.equal((await f.request(url)).status, 200)
  assert.equal((await f.request(new URL('private.txt', url))).status, 403)
  assert.equal((await f.request(f.protocol.toAssetUrl(secret))).status, 403)
  assert.equal((await f.request(f.protocol.toAssetUrl(entry))).status, 403)
})

test('web packages have unique origins, self assets work, and path traversal and junction escape are denied', async (t) => {
  const f = await desktopFixture(t)
  const a = await f.addWallpaper('A', [], 'web'), b = await f.addWallpaper('B', [], 'web')
  await fs.writeFile(join(dirname(a.source), 'script.js'), 'window.loaded = true')
  const aUrl = await f.protocol.createWallpaperWebUrl(a.source), bUrl = await f.protocol.createWallpaperWebUrl(b.source)
  assert.notEqual(new URL(aUrl).host, new URL(bUrl).host)
  const script = await f.request(new URL('script.js', aUrl))
  assert.equal(script.status, 200)
  assert.equal(await script.text(), 'window.loaded = true')
  const response = await f.request(aUrl)
  const csp = response.headers.get('Content-Security-Policy')
  assert.match(csp, /connect-src 'self' https:/)
  assert.match(csp, /sandbox allow-scripts allow-same-origin/)
  assert.match(csp, /frame-src 'none'/)
  assert.equal((await f.request(new URL('../B/index.html', aUrl))).status, 403)
  assert.equal((await f.request(new URL('%2e%2e%5cB%5cindex.html', aUrl))).status, 403)
  await fs.symlink(dirname(b.source), join(dirname(a.source), 'escape'), 'junction')
  assert.equal((await f.request(new URL('escape/index.html', aUrl))).status, 403)
  assert.equal((await f.request(f.protocol.toAssetUrl(a.source))).status, 403)
})

test('CORS never grants a wallpaper package access to the shared asset origin', async (t) => {
  const f = await desktopFixture(t)
  const a = await f.addWallpaper('A', [], 'web')
  const url = await f.protocol.createWallpaperWebUrl(a.source)
  const media = f.protocol.toAssetUrl(join(dirname(a.source), 'preview.png'))
  const untrusted = await f.request(media, 'lyasset://' + new URL(url).host)
  assert.equal(untrusted.headers.get('Access-Control-Allow-Origin'), null)
  const trusted = await f.request(media, 'http://localhost:5173')
  assert.equal(trusted.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')
})

test('HTML import copies only explicitly selected bytes and excludes synthetic sibling private files', async (t) => {
  const f = await desktopFixture(t)
  const entry = join(f.root, 'selected.html')
  await fs.writeFile(entry, '<p>test</p>')
  await fs.writeFile(join(f.root, 'private.txt'), 'synthetic secret')
  const result = await f.invoke('WALLPAPER_IMPORT', entry, meta('single'))
  assert.equal(result.ok, true)
  assert.deepEqual((await fs.readdir(dirname(result.item.source))).sort(), ['FlowWallDeskInfo.json', 'selected.html'])
})

test('ZIP picker/import accepts a complete web package, rejects missing HTML and cleans failed imports', async (t) => {
  const f = await desktopFixture(t)
  const good = join(f.root, 'good.zip'), bad = join(f.root, 'bad.zip')
  await zip(good, { 'index.html': '<script src="app.js"></script>', 'app.js': 'window.ok = true' })
  await zip(bad, { 'readme.txt': 'no entry' })
  f.controls.pickedFile = good
  assert.equal((await f.invoke('WALLPAPER_PICK_FILE')).type, 'web')
  const imported = await f.invoke('WALLPAPER_IMPORT', good, meta('pack'))
  assert.equal(imported.ok, true)
  const url = await f.protocol.createWallpaperWebUrl(imported.item.source)
  assert.equal((await f.request(new URL('app.js', url))).status, 200)
  const invalid = await f.invoke('WALLPAPER_IMPORT', bad, meta('bad'))
  assert.equal(invalid.ok, false)
  assert.match(invalid.error, /HTML/)
  await assert.rejects(fs.access(join(f.paths.getUserWallpapersRoot(), 'bad')))
})

test('online update/remove and local remove refuse secondary and disconnected assignments', async (t) => {
  const f = await desktopFixture(t)
  const remote = await f.addWallpaper('remote:test-resource'), user = await f.addWallpaper('user:local')
  f.state.wallpaperDisplay.assignments = { disconnected: remote.id, secondary: user.id }
  const service = f.load('src/main/services/wallpaper-resource-service.ts')
  assert.equal((await service.installWallpaperResource('test-resource')).ok, false)
  assert.equal((await service.removeWallpaperResource('test-resource')).ok, false)
  assert.equal((await f.invoke('WALLPAPER_REMOVE', user.id)).ok, false)
  await fs.access(remote.source)
  await fs.access(user.source)
  f.state.wallpaperDisplay.assignments = {}
  assert.equal((await service.removeWallpaperResource('test-resource')).ok, true)
  assert.equal((await f.invoke('WALLPAPER_REMOVE', user.id)).ok, true)
  await assert.rejects(fs.access(remote.source))
  await assert.rejects(fs.access(user.source))
})
