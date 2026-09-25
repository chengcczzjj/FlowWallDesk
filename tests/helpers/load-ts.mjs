import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const { process, console, Buffer, URL, TextEncoder, TextDecoder, Request, Response, Headers,
  structuredClone, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate } = globalThis

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const nativeRequire = createRequire(import.meta.url)

// Execute production TS modules with isolated Electron/storage/timer boundaries.
// Runtime imports (including aliases) are resolved, unlike source-regex contracts.
export function createTsLoader({ mocks = {}, globals = {}, mainDir } = {}) {
  const cache = new Map()
  function load(path) {
    let filename = resolve(projectRoot, path)
    if (!extname(filename)) filename += existsSync(filename + '.ts') ? '.ts' : '.tsx'
    if (Object.hasOwn(mocks, filename)) return mocks[filename]
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const source = readFileSync(filename, 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    })
    const require = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier]
      if (specifier.startsWith('@shared/')) return load('src/shared/' + specifier.slice(8))
      if (specifier.startsWith('.')) return load(resolve(dirname(filename), specifier))
      return nativeRequire(specifier)
    }
    runInNewContext(outputText, {
      exports: module.exports, module, require,
      __dirname: mainDir && filename.includes(`${resolve(projectRoot, 'src/main')}`) ? mainDir : dirname(filename),
      __filename: filename, process, console, Buffer, URL, TextEncoder, TextDecoder,
      Request, Response, Headers, structuredClone,
      setTimeout, clearTimeout, setInterval, clearInterval, ...globals,
    }, { filename })
    return module.exports
  }
  return load
}

export function fakeTimers() {
  let next = 1
  const tasks = new Map()
  const setTimeout = (fn, delay = 0) => {
    const id = next++
    tasks.set(id, { fn, delay })
    return id
  }
  const clearTimeout = (id) => { tasks.delete(id) }
  return { tasks, globals: { setTimeout, clearTimeout, setInterval: setTimeout, clearInterval: clearTimeout },
    fire(id = tasks.keys().next().value) {
      const task = tasks.get(id)
      if (!task) throw new Error('No scheduled timer')
      tasks.delete(id)
      task.fn()
    },
  }
}

export const plain = (value) => JSON.parse(JSON.stringify(value))
export const tick = () => new Promise((resolve) => setImmediate(resolve))
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
