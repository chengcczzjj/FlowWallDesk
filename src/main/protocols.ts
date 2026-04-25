import { protocol, net } from 'electron'
import { promises as fs } from 'fs'
import { extname } from 'path'
import { pathToFileURL } from 'url'

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
    const absPath = parseAbsPath(request.url)
    if (!absPath) {
      return new Response('Bad Request', { status: 400 })
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
        return new Response(resp.body, { status: resp.status, headers })
      }
      const buf = await fs.readFile(absPath)
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(buf.byteLength),
          'Cache-Control': 'no-cache',
        },
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
