import { createWriteStream, promises as fs } from 'fs'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { openPromise as openZip } from 'yauzl'

export interface SafeZipExtractionOptions {
  maxEntries: number
  maxUncompressedBytes: number
}

function isInside(rootPath: string, targetPath: string): boolean {
  const rel = relative(rootPath, targetPath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isUnsafeWindowsSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') return true
  if (/[<>:"|?*]/.test(segment) || /[. ]$/.test(segment)) return true
  if (Array.from(segment).some((character) => character.charCodeAt(0) < 32)) return true
  const deviceName = segment.split('.')[0].toUpperCase()
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName)
}

export async function extractZipSafely(
  zipPath: string,
  destination: string,
  options: SafeZipExtractionOptions,
): Promise<void> {
  const destinationRoot = resolve(destination)
  const archive = await openZip(zipPath, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  })
  if (archive.fileSize > options.maxUncompressedBytes) {
    archive.close()
    throw new Error('壁纸 ZIP 超过大小限制')
  }
  let entryCount = 0
  let totalUncompressedSize = 0
  try {
    for await (const entry of archive.eachEntry()) {
      entryCount += 1
      if (entryCount > options.maxEntries) throw new Error('壁纸包文件数量超过限制')
      if (entry.isEncrypted()) throw new Error('壁纸包不能包含加密文件')
      const fileName = entry.fileName
      const pathName = fileName.endsWith('/') ? fileName.slice(0, -1) : fileName
      const pathSegments = pathName.split('/')
      if (
        !pathName || pathName.includes('\\') || pathName.includes('\0') ||
        pathName.startsWith('/') || /^[A-Za-z]:/.test(pathName) ||
        pathSegments.some(isUnsafeWindowsSegment)
      ) {
        throw new Error('壁纸包包含不安全路径')
      }

      const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
      const unixType = unixMode & 0o170000
      if (unixType === 0o120000) throw new Error('壁纸包不允许包含符号链接')
      const isDirectory = fileName.endsWith('/') || unixType === 0o040000
      if (unixType !== 0 && unixType !== 0o040000 && unixType !== 0o100000) {
        throw new Error('壁纸包包含不受支持的特殊文件')
      }

      totalUncompressedSize += entry.uncompressedSize
      if (totalUncompressedSize > options.maxUncompressedBytes) {
        throw new Error('壁纸包解压后超过大小限制')
      }
      const targetPath = resolve(destinationRoot, ...pathSegments)
      if (!isInside(destinationRoot, targetPath)) throw new Error('壁纸包包含越界路径')
      if (isDirectory) {
        await fs.mkdir(targetPath, { recursive: true })
        continue
      }

      await fs.mkdir(dirname(targetPath), { recursive: true })
      const input = await archive.openReadStreamPromise(entry)
      let emittedBytes = 0
      const sizeGuard = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          emittedBytes += chunk.length
          if (emittedBytes > entry.uncompressedSize) {
            callback(new Error('壁纸包条目解压大小异常'))
            return
          }
          callback(null, chunk)
        },
      })
      await pipeline(input, sizeGuard, createWriteStream(targetPath, { flags: 'wx' }))
    }
  } finally {
    archive.close()
  }
}
