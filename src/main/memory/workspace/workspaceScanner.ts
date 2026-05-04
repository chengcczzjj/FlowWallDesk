import fs from 'node:fs'
import path from 'node:path'
import type { WorkspaceFileStats } from '@shared/types'

const MAX_SCANNED_ENTRIES = 5000
const LARGE_DIRECTORY_NAMES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git'])
const PROJECT_FILE_NAMES = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'README.md',
  'readme.md',
])
const INSTRUCTION_FILE_NAMES = new Set(['AGENTS.md', 'agents.md', 'README.md', 'readme.md'])
const SENSITIVE_FILE_NAMES = new Set(['.env', '.env.local', '.pem', '.key'])

function toRelative(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).replace(/\\/g, '/') || '.'
}

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase()
  return SENSITIVE_FILE_NAMES.has(name) || lower.includes('credential') || lower.includes('token')
}

export function scanWorkspace(rootPath: string): WorkspaceFileStats {
  const mainFileTypes = new Map<string, number>()
  const projectFiles = new Set<string>()
  const instructionFiles = new Set<string>()
  const sensitiveFiles = new Set<string>()
  const largeDirectories = new Set<string>()
  const pending = [rootPath]

  let fileCount = 0
  let directoryCount = 0
  let totalSize = 0
  let scannedEntries = 0

  while (pending.length > 0 && scannedEntries < MAX_SCANNED_ENTRIES) {
    const current = pending.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (scannedEntries >= MAX_SCANNED_ENTRIES) break
      scannedEntries += 1

      const absolutePath = path.join(current, entry.name)
      const relativePath = toRelative(rootPath, absolutePath)

      if (entry.isDirectory()) {
        directoryCount += 1
        if (LARGE_DIRECTORY_NAMES.has(entry.name)) {
          largeDirectories.add(relativePath)
          continue
        }
        pending.push(absolutePath)
        continue
      }

      if (!entry.isFile()) continue

      fileCount += 1
      try {
        totalSize += fs.statSync(absolutePath).size
      } catch {
        // 文件可能在扫描期间被删除，忽略即可
      }

      const ext = path.extname(entry.name).toLowerCase() || '[no-ext]'
      mainFileTypes.set(ext, (mainFileTypes.get(ext) ?? 0) + 1)

      if (PROJECT_FILE_NAMES.has(entry.name)) projectFiles.add(relativePath)
      if (INSTRUCTION_FILE_NAMES.has(entry.name)) instructionFiles.add(relativePath)
      if (relativePath === '.local-agent/rules.md') instructionFiles.add(relativePath)
      if (isSensitiveName(entry.name)) sensitiveFiles.add(relativePath)
    }
  }

  return {
    fileCount,
    directoryCount,
    totalSize,
    mainFileTypes: [...mainFileTypes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ext, count]) => `${ext}:${count}`),
    projectFiles: [...projectFiles].sort(),
    instructionFiles: [...instructionFiles].sort(),
    sensitiveFiles: [...sensitiveFiles].sort(),
    largeDirectories: [...largeDirectories].sort(),
    scannedAt: Date.now(),
  }
}