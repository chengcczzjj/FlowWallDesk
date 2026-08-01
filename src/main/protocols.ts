import { protocol, net } from 'electron'
import { promises as fs } from 'fs'
import { extname, dirname, isAbsolute, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { isTrustedRendererAssetOrigin } from '@shared/asset-url'

/**
 * 自定义协议 lyasset://<encoded-absolute-path>
 *
 * 渲染进程通过 `lyasset:///${encodeURIComponent(absolutePath)}` 加载本地资源。
 * 必须在 app.ready 之前调用 registerSchemesAsPrivileged。
 */
export function registerAssetSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'lyasset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        corsEnabled: true,
      },
    },
  ])
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

const allowedRoots = new Set<string>()
const allowedFiles = new Set<string>()

function addAssetCorsHeaders(request: Request, headers: Headers): void {
  const origin = request.headers.get('Origin')
  if (!isTrustedRendererAssetOrigin(origin)) return
  headers.set('Access-Control-Allow-Origin', origin!)
  headers.set('Vary', 'Origin')
}

function isInside(rootPath: string, targetPath: string): boolean {
  const rel = relative(rootPath, targetPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function realPathOrResolved(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath)
  } catch {
    return resolve(filePath)
  }
}

/** 注册应用拥有的资源根目录。协议处理器只会读取这些目录内的文件。 */
export async function allowAssetRoot(rootPath: string): Promise<void> {
  allowedRoots.add(await realPathOrResolved(rootPath))
}

/**
 * 临时授权用户明确选择的单个媒体文件；HTML 会授权其所在目录以加载相对资源。
 * 目录授权仍会经过 realpath 边界检查，不能通过 ../ 或 junction 跳出。
 */
export async function allowUserSelectedAsset(filePath: string): Promise<void> {
  const realPath = await fs.realpath(filePath)
  const extension = extname(realPath).toLowerCase()
  if (extension === '.html' || extension === '.htm') {
    allowedRoots.add(await fs.realpath(dirname(realPath)))
    return
  }
  const mime = MIME[extension]
  if (!mime || (!mime.startsWith('image/') && !mime.startsWith('video/'))) {
    throw new Error('只允许临时授权图片、视频或 HTML 壁纸资源。')
  }
  allowedFiles.add(realPath)
}

async function resolveAllowedAssetPath(inputPath: string): Promise<string | null> {
  if (!isAbsolute(inputPath)) return null
  let realPath: string
  try {
    realPath = await fs.realpath(inputPath)
  } catch {
    return null
  }
  if (allowedFiles.has(realPath)) return realPath
  for (const rootPath of allowedRoots) {
    if (isInside(rootPath, realPath)) return realPath
  }
  return null
}

function parseAbsPath(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    let p = decodeURIComponent(u.pathname.replace(/^\//, ''))
    // 如果 host 是单字母（Chromium 把盘符当作了 host），还原盘符前缀
    if (u.host && /^[a-zA-Z]$/.test(u.host)) {
      p = `${u.host.toUpperCase()}:/${p}`
    }
    if (!p) return null
    return p
  } catch {
    return null
  }
}

export function registerAssetProtocol(): void {
  protocol.handle('lyasset', async (request) => {
    const requestedPath = parseAbsPath(request.url)
    if (!requestedPath) {
      return new Response('Bad Request', { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
    const absPath = await resolveAllowedAssetPath(requestedPath)
    if (!absPath) {
      console.warn('[lyasset] 拒绝越界资源请求', requestedPath)
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }
    try {
      const stat = await fs.stat(absPath)
      if (!stat.isFile()) {
        return new Response('Not a file', { status: 404 })
      }
      const ext = extname(absPath).toLowerCase()
      const mime = MIME[ext] ?? 'application/octet-stream'
      // 视频/音频/HTML 走 net.fetch，支持 Range & 流式
      if (mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'text/html; charset=utf-8') {
        const fileUrl = pathToFileURL(absPath).toString()
        const resp = await net.fetch(fileUrl)
        const headers = new Headers(resp.headers)
        headers.set('Content-Type', mime)
        addAssetCorsHeaders(request, headers)
        return new Response(resp.body, { status: resp.status, headers })
      }
      const buf = await fs.readFile(absPath)
      const headers = new Headers({
        'Content-Type': mime,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'no-cache',
      })
      addAssetCorsHeaders(request, headers)
      return new Response(buf, {
        status: 200,
        headers,
      })
    } catch (err) {
      console.error('[lyasset] 读取失败', absPath, err)
      return new Response('Not Found', { status: 404 })
    }
  })
}

/** 把绝对路径转为 lyasset URL（主进程或预加载侧使用）。 */
export function toAssetUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  return `lyasset://local/${normalized.split('/').map(encodeURIComponent).join('/')}`
}
