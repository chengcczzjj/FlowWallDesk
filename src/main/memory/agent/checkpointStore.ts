import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ulid } from 'ulidx'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { checkpoints } from '../db/schema'
import { CHECKPOINTS_DIR } from '../db/paths'
import { AgentRunStore } from './agentRunStore'
import type { AgentCheckpoint, AgentCheckpointFileBackup } from '@shared/types'

interface CheckpointRow {
  id: string
  workspaceId: string | null
  runId: string
  name: string
  fileBackupsJson: string
  manifestJson: string
  createdAt: number
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toCheckpoint(row: CheckpointRow): AgentCheckpoint {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    runId: row.runId,
    name: row.name,
    fileBackups: parseJson<AgentCheckpointFileBackup[]>(row.fileBackupsJson, []),
    manifest: parseJson(row.manifestJson, { fileCount: 0, totalSize: 0, createdBy: 'checkpoint-store' }),
    createdAt: row.createdAt,
  }
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/')
}

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveWorkspaceFile(rootPath: string, relativePath: string): { absolutePath: string; relativePath: string } {
  const rootRealPath = fs.realpathSync.native(rootPath)
  const absolutePath = path.resolve(rootRealPath, relativePath)
  if (!fs.existsSync(absolutePath)) throw new Error(`路径不存在: ${relativePath}`)
  const resolvedPath = fs.realpathSync.native(absolutePath)
  if (!isInside(rootRealPath, resolvedPath)) throw new Error(`路径位于 Workspace 外: ${relativePath}`)
  const stats = fs.statSync(resolvedPath)
  if (!stats.isFile()) throw new Error(`Checkpoint 目前只支持文件: ${relativePath}`)
  return { absolutePath: resolvedPath, relativePath: normalizeRelative(path.relative(rootRealPath, resolvedPath)) }
}

function checksumFile(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function summarizeDiff(before: string, after: string): { changed: boolean; addedLines: number; removedLines: number; preview: string[] } {
  if (before === after) return { changed: false, addedLines: 0, removedLines: 0, preview: [] }
  const beforeLines = before.split(/\r?\n/)
  const afterLines = after.split(/\r?\n/)
  const max = Math.max(beforeLines.length, afterLines.length)
  let addedLines = 0
  let removedLines = 0
  const preview: string[] = []
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] === afterLines[index]) continue
    if (beforeLines[index] !== undefined) removedLines += 1
    if (afterLines[index] !== undefined) addedLines += 1
    if (preview.length < 12) {
      if (beforeLines[index] !== undefined) preview.push(`- ${beforeLines[index]}`)
      if (afterLines[index] !== undefined) preview.push(`+ ${afterLines[index]}`)
    }
  }
  return { changed: true, addedLines, removedLines, preview }
}

function syncRunCheckpoints(runId: string): AgentCheckpoint[] {
  const checkpointsForRun = CheckpointStore.listByRun(runId)
  AgentRunStore.updateCheckpoints(runId, checkpointsForRun)
  return checkpointsForRun
}

export const CheckpointStore = {
  create(data: { workspaceId?: string | null; runId: string; rootPath: string; name?: string; paths: string[] }): AgentCheckpoint {
    const db = getDb()
    const now = Date.now()
    const id = ulid()
    const checkpointDir = path.join(CHECKPOINTS_DIR, data.workspaceId ?? 'workspace', id)
    fs.mkdirSync(checkpointDir, { recursive: true })

    const fileBackups: AgentCheckpointFileBackup[] = []
    let totalSize = 0
    const uniquePaths = [...new Set(data.paths.map(normalizeRelative))]
    const rootRealPath = fs.realpathSync.native(data.rootPath)

    for (const inputPath of uniquePaths) {
      const absolutePath = path.resolve(rootRealPath, inputPath)
      if (!isInside(rootRealPath, absolutePath)) throw new Error(`路径位于 Workspace 外: ${inputPath}`)
      if (!fs.existsSync(absolutePath)) continue
      const resolved = resolveWorkspaceFile(data.rootPath, inputPath)
      const stats = fs.statSync(resolved.absolutePath)
      const backupPath = path.join(checkpointDir, resolved.relativePath)
      fs.mkdirSync(path.dirname(backupPath), { recursive: true })
      fs.copyFileSync(resolved.absolutePath, backupPath)
      totalSize += stats.size
      fileBackups.push({
        path: resolved.relativePath,
        backupPath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        checksum: checksumFile(backupPath),
      })
    }

    const checkpoint: AgentCheckpoint = {
      id,
      workspaceId: data.workspaceId ?? null,
      runId: data.runId,
      name: data.name?.trim() || `Checkpoint ${new Date(now).toLocaleString('zh-CN')}`,
      fileBackups,
      manifest: { fileCount: fileBackups.length, totalSize, createdBy: 'checkpoint-store' },
      createdAt: now,
    }

    db.insert(checkpoints).values({
      id: checkpoint.id,
      workspaceId: checkpoint.workspaceId,
      runId: checkpoint.runId,
      name: checkpoint.name,
      fileBackupsJson: JSON.stringify(checkpoint.fileBackups),
      manifestJson: JSON.stringify(checkpoint.manifest),
      createdAt: checkpoint.createdAt,
    }).run()
    syncRunCheckpoints(data.runId)
    return checkpoint
  },

  get(id: string): AgentCheckpoint | undefined {
    const db = getDb()
    const row = db.select().from(checkpoints).where(eq(checkpoints.id, id)).get() as CheckpointRow | undefined
    return row ? toCheckpoint(row) : undefined
  },

  listByRun(runId: string, limit = 20): AgentCheckpoint[] {
    const db = getDb()
    return db.select()
      .from(checkpoints)
      .where(eq(checkpoints.runId, runId))
      .orderBy(desc(checkpoints.createdAt))
      .limit(limit)
      .all()
      .map((row) => toCheckpoint(row as CheckpointRow))
  },

  compareFile(checkpointId: string, rootPath: string, relativePath: string) {
    const checkpoint = this.get(checkpointId)
    if (!checkpoint) throw new Error('Checkpoint 不存在')
    const normalizedPath = normalizeRelative(relativePath)
    const backup = checkpoint.fileBackups.find((item) => item.path === normalizedPath)
    if (!backup) throw new Error(`Checkpoint 中没有该文件: ${normalizedPath}`)
    const current = resolveWorkspaceFile(rootPath, normalizedPath)
    const before = fs.readFileSync(backup.backupPath, 'utf-8')
    const after = fs.readFileSync(current.absolutePath, 'utf-8')
    return { path: normalizedPath, ...summarizeDiff(before, after) }
  },

  restore(checkpointId: string, rootPath: string, paths?: string[]): { restored: string[]; skipped: string[] } {
    const checkpoint = this.get(checkpointId)
    if (!checkpoint) throw new Error('Checkpoint 不存在')
    const requested = paths?.length ? new Set(paths.map(normalizeRelative)) : null
    const restored: string[] = []
    const skipped: string[] = []
    const rootRealPath = fs.realpathSync.native(rootPath)

    for (const backup of checkpoint.fileBackups) {
      if (requested && !requested.has(backup.path)) {
        skipped.push(backup.path)
        continue
      }
      const targetPath = path.resolve(rootRealPath, backup.path)
      if (!isInside(rootRealPath, targetPath)) throw new Error(`恢复目标位于 Workspace 外: ${backup.path}`)
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.copyFileSync(backup.backupPath, targetPath)
      restored.push(backup.path)
    }

    return { restored, skipped }
  },
}