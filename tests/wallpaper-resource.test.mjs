import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { URL } from 'node:url'
import { ZipFile } from 'yazl'

import { IPC } from '../src/shared/ipc-channels.ts'
import {
  compareWallpaperResourceVersions,
  isValidWallpaperResourceId,
  resolveWallpaperResourceInstallState,
} from '../src/shared/wallpaper-resource.ts'
import { extractZipSafely } from '../src/main/services/safe-zip.ts'

async function createZip(source, destination) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(destination)
    const archive = new ZipFile()
    output.once('close', resolve)
    output.once('error', reject)
    archive.outputStream.once('error', reject)
    archive.outputStream.pipe(output)
    archive.addEmptyDirectory('empty/')
    archive.addFile(join(source, 'FlowWallDeskInfo.json'), 'FlowWallDeskInfo.json')
    archive.addFile(join(source, 'assets', 'index.html'), 'assets/index.html')
    archive.end()
  })
}

async function createSymlinkZip(destination) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(destination)
    const archive = new ZipFile()
    output.once('close', resolve)
    output.once('error', reject)
    archive.outputStream.once('error', reject)
    archive.outputStream.pipe(output)
    archive.addBuffer(Buffer.from('../outside.txt'), 'unsafe-link', { mode: 0o120777 })
    archive.end()
  })
}

test('wallpaper resource ids and versions remain stable across manifests', () => {
  assert.equal(isValidWallpaperResourceId('azur-lane-001'), true)
  assert.equal(isValidWallpaperResourceId('../escape'), false)
  assert.equal(isValidWallpaperResourceId('中文目录'), false)
  assert.equal(isValidWallpaperResourceId('a'.repeat(97)), false)
  assert.ok(compareWallpaperResourceVersions('1.10.0', '1.9.0') > 0)
  assert.equal(resolveWallpaperResourceInstallState(undefined, '1.0.0'), 'not-installed')
  assert.equal(resolveWallpaperResourceInstallState('1.0.0', '1.0.0'), 'installed')
  assert.equal(resolveWallpaperResourceInstallState('2.0.0', '1.0.0'), 'installed')
  assert.equal(resolveWallpaperResourceInstallState('1.0.0', '1.1.0'), 'update-available')
})

test('online wallpaper IPC surface covers refresh install remove progress and owner publishing', () => {
  for (const channel of [
    IPC.WALLPAPER_RESOURCE_CATALOG,
    IPC.WALLPAPER_RESOURCE_REFRESH,
    IPC.WALLPAPER_RESOURCE_INSTALL,
    IPC.WALLPAPER_RESOURCE_REMOVE,
    IPC.WALLPAPER_RESOURCE_PROGRESS,
    IPC.WALLPAPER_RESOURCE_CATALOG_CHANGED,
    IPC.WALLPAPER_OWNER_STATUS,
    IPC.WALLPAPER_OWNER_CONFIGURE,
    IPC.WALLPAPER_OWNER_CLEAR_CREDENTIALS,
    IPC.WALLPAPER_OWNER_PUBLISH,
    IPC.WALLPAPER_OWNER_PUBLISH_PROGRESS,
  ]) {
    assert.equal(typeof channel, 'string')
    assert.ok(channel.length > 0)
  }
  assert.equal(new Set(Object.values(IPC)).size, Object.values(IPC).length)
})

test('downloads are checksum verified and installed atomically', async () => {
  const source = await readFile(new URL('../src/main/services/wallpaper-resource-service.ts', import.meta.url), 'utf8')
  const extractorSource = await readFile(new URL('../src/main/services/safe-zip.ts', import.meta.url), 'utf8')
  assert.match(source, /MAX_PACKAGE_BYTES = 2 \* 1024 \* 1024 \* 1024/)
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /SHA-256 校验失败/)
  assert.match(source, /extractZipSafely\(zipPath/)
  assert.match(source, /validateExtractedTree/)
  assert.match(extractorSource, /unixType === 0o120000/)
  assert.match(extractorSource, /pathSegments\.some/)
  assert.match(extractorSource, /flags: 'wx'/)
  assert.match(source, /\.install-\$\{entry\.id\}/)
  assert.match(source, /\.backup-\$\{entry\.id\}/)
})

test('safe ZIP extraction accepts a normal wallpaper package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingyue-wallpaper-test-'))
  const source = join(root, 'source')
  const destination = join(root, 'destination')
  const zipPath = join(root, 'wallpaper.zip')
  try {
    await mkdir(join(source, 'assets'), { recursive: true })
    await writeFile(join(source, 'FlowWallDeskInfo.json'), JSON.stringify({
      Title: 'Test',
      Type: 1,
      FileName: 'assets/index.html',
    }))
    await writeFile(join(source, 'assets', 'index.html'), '<!doctype html><title>test</title>')
    await createZip(source, zipPath)
    await mkdir(destination, { recursive: true })
    await extractZipSafely(zipPath, destination, {
      maxEntries: 20,
      maxUncompressedBytes: 1024 * 1024,
    })
    assert.match(await readFile(join(destination, 'assets', 'index.html'), 'utf8'), /<title>test<\/title>/)
    assert.equal((await readFile(join(destination, 'FlowWallDeskInfo.json'), 'utf8')).includes('assets/index.html'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('safe ZIP extraction rejects symlink entries before writing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lingyue-wallpaper-symlink-test-'))
  const destination = join(root, 'destination')
  const zipPath = join(root, 'wallpaper.zip')
  try {
    await createSymlinkZip(zipPath)
    await mkdir(destination, { recursive: true })
    await assert.rejects(
      extractZipSafely(zipPath, destination, { maxEntries: 20, maxUncompressedBytes: 1024 * 1024 }),
      /符号链接/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('owner publishing is hidden locally and authorized by the official GitHub account', async () => {
  const ownerSource = await readFile(new URL('../src/main/services/wallpaper-owner-service.ts', import.meta.url), 'utf8')
  const appSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const dialogSource = await readFile(new URL('../src/renderer/main-ui/components/WallpaperOwnerDialog.tsx', import.meta.url), 'utf8')
  assert.match(ownerSource, /--lingyue-wallpaper-owner/)
  assert.match(ownerSource, /safeStorage\.encryptString/)
  assert.match(ownerSource, /account\?\.login\?\.toLowerCase\(\) !== expectedOwner\.toLowerCase\(\)/)
  assert.match(ownerSource, /OFFICIAL_WALLPAPER_REPOSITORY/)
  assert.match(ownerSource, /uploadReleaseAsset/)
  assert.match(ownerSource, /updateRemoteManifest/)
  assert.match(appSource, /subPage: 'store'/)
  assert.match(dialogSource, /Token 使用 Windows DPAPI 加密/)
})
