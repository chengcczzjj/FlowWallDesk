import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import console from 'node:console'
import { projectRoot } from '../helpers/load-ts.mjs'

const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
await mkdir(join(projectRoot, 'out'), { recursive: true })
for (const name of ['wallpaper-sandbox', 'wallpaper-renderer']) {
  let output = ''
  const code = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [join(projectRoot, 'tests/electron', name + '.cjs')], {
      cwd: projectRoot, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (data) => { output += data })
    child.stderr.on('data', (data) => { output += data })
    child.on('error', reject)
    child.on('close', resolve)
  })
  await writeFile(join(projectRoot, 'out', name + '.log'), output)
  console.log(output.trim())
  const marker = name === 'wallpaper-sandbox' ? 'SANDBOX_SMOKE_PASS ' : 'RENDERER_SMOKE_PASS '
  if (code !== 0 || !output.includes(marker)) throw new Error(name + ' failed acceptance (exit ' + code + ')')
}
