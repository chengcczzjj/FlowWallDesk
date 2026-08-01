import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'

import { IPC } from '../src/shared/ipc-channels.ts'
import { toSafeUpdateErrorMessage } from '../src/shared/update-error.ts'

test('stable release metadata and updater publishing stay wired together', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const builderConfig = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')

  assert.equal(packageJson.version, '1.0.2')
  assert.ok(packageJson.dependencies['electron-updater'])
  assert.match(packageJson.scripts['build:win'], /electron-builder --win/)
  assert.match(packageJson.scripts['build:win'], /signExecutable=false/)
  assert.match(builderConfig, /provider: github/)
  assert.match(builderConfig, /owner: chengcczzjj/)
  assert.match(builderConfig, /repo: FlowWallDesk/)
  assert.match(builderConfig, /artifactName: \$\{name\}-\$\{version\}-setup\.\$\{ext\}/)
})

test('update and launch-at-login IPC channels are unique and complete', () => {
  const channels = Object.values(IPC)
  assert.equal(new Set(channels).size, channels.length)

  for (const channel of [
    IPC.APP_GET_LAUNCH_AT_LOGIN,
    IPC.APP_SET_LAUNCH_AT_LOGIN,
    IPC.APP_UPDATE_GET_STATUS,
    IPC.APP_UPDATE_CHECK,
    IPC.APP_UPDATE_DOWNLOAD,
    IPC.APP_UPDATE_INSTALL,
    IPC.APP_UPDATE_STATE_CHANGED,
  ]) {
    assert.ok(channels.includes(channel))
  }
})

test('sandboxed windows use one role-gated preload bundle', async () => {
  const viteConfig = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
  const windowSources = await Promise.all([
    'mainWindow.ts',
    'canvasWindow.ts',
    'wallpaperWindow.ts',
  ].map((name) => readFile(new URL(`../src/main/windows/${name}`, import.meta.url), 'utf8')))

  assert.match(viteConfig, /index: resolve\(__dirname, 'src\/preload\/index\.ts'\)/)
  for (const source of windowSources) {
    assert.match(source, /preload: join\(__dirname, '\.\.\/preload\/index\.js'\)/)
    assert.match(source, /additionalArguments: \['--lingyue-window-role=/)
    assert.match(source, /sandbox: true/)
  }
})

test('update errors never expose response headers or cookies', () => {
  const message = toSafeUpdateErrorMessage(new Error('404\nHeaders: { "set-cookie": "secret" }'))
  assert.equal(message, '更新服务尚未发布可用版本，请在正式版本发布后重试。')
  assert.doesNotMatch(message, /cookie|secret|Headers/i)
  assert.ok(toSafeUpdateErrorMessage(new Error('custom failure\nprivate details')).length <= 180)
})
