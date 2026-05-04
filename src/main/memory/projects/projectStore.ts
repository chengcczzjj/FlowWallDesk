import { ulid } from 'ulidx'
import { eq, desc, ne } from 'drizzle-orm'
import { getDb } from '../db/client'
import { projects } from '../db/schema'
import { scanWorkspace } from '../workspace/workspaceScanner'
import type { WorkspaceFileStats, WorkspaceIgnoreRules, WorkspaceIndexStatus, WorkspacePermissionProfile } from '@shared/types'

export interface ProjectRecord {
  id: string
  name: string
  path: string | null
  rootPath: string | null
  displayName: string
  permissionProfile: WorkspacePermissionProfile
  indexStatus: WorkspaceIndexStatus
  fileStats: WorkspaceFileStats | null
  ignoreRules: WorkspaceIgnoreRules | null
  instructions: string | null
  lastOpenedAt: number
  icon: string | null
  color: string | null
  createdAt: number
  updatedAt: number
  sortOrder: number
  status: string
}

interface ProjectRow extends Omit<ProjectRecord, 'fileStats' | 'ignoreRules' | 'displayName' | 'permissionProfile' | 'indexStatus' | 'lastOpenedAt'> {
  displayName: string | null
  permissionProfile: WorkspacePermissionProfile | string | null
  indexStatus: WorkspaceIndexStatus | string | null
  fileStatsJson: string | null
  ignoreRulesJson: string | null
  lastOpenedAt: number | null
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    rootPath: row.rootPath ?? row.path,
    displayName: row.displayName ?? row.name,
    permissionProfile: (row.permissionProfile ?? 'ask-before-editing') as WorkspacePermissionProfile,
    indexStatus: (row.indexStatus ?? 'not-indexed') as WorkspaceIndexStatus,
    fileStats: parseJson<WorkspaceFileStats>(row.fileStatsJson),
    ignoreRules: parseJson<WorkspaceIgnoreRules>(row.ignoreRulesJson),
    instructions: row.instructions,
    lastOpenedAt: row.lastOpenedAt ?? row.updatedAt,
    icon: row.icon,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sortOrder: row.sortOrder,
    status: row.status,
  }
}

export const ProjectStore = {
  /** 创建项目 */
  create(name: string, path?: string, icon?: string, color?: string): ProjectRecord {
    const db = getDb()
    const now = Date.now()
    const id = ulid()
    let fileStats: WorkspaceFileStats | null = null
    let indexStatus: WorkspaceIndexStatus = 'not-indexed'
    if (path) {
      try {
        fileStats = scanWorkspace(path)
        indexStatus = 'ready'
      } catch {
        indexStatus = 'index-failed'
      }
    }
    const row = {
      id,
      name,
      path: path ?? null,
      rootPath: path ?? null,
      displayName: name,
      permissionProfile: 'ask-before-editing',
      indexStatus,
      fileStatsJson: fileStats ? JSON.stringify(fileStats) : null,
      ignoreRulesJson: null,
      instructions: null,
      lastOpenedAt: now,
      icon: icon ?? null,
      color: color ?? null,
      createdAt: now,
      updatedAt: now,
      sortOrder: 0,
      status: 'active',
    }
    db.insert(projects).values(row).run()
    return toProjectRecord(row as ProjectRow)
  },

  /** 列出所有活跃项目 */
  list(limit = 50): ProjectRecord[] {
    const db = getDb()
    return db
      .select()
      .from(projects)
      .where(ne(projects.status, 'deleted'))
      .orderBy(desc(projects.updatedAt))
      .limit(limit)
      .all()
      .map((row) => toProjectRecord(row as ProjectRow))
  },

  /** 获取单个项目 */
  get(id: string): ProjectRecord | undefined {
    const db = getDb()
    const row = db.select().from(projects).where(eq(projects.id, id)).get() as ProjectRow | undefined
    return row ? toProjectRecord(row) : undefined
  },

  /** 更新项目 */
  update(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'path' | 'rootPath' | 'displayName' | 'permissionProfile' | 'indexStatus' | 'fileStats' | 'ignoreRules' | 'instructions' | 'lastOpenedAt' | 'icon' | 'color'>>): void {
    const db = getDb()
    const { fileStats, ignoreRules, ...rest } = data
    const nextRootPath = data.rootPath ?? data.path
    let scannedStats: WorkspaceFileStats | null | undefined
    let scannedStatus: WorkspaceIndexStatus | undefined
    if (nextRootPath && fileStats === undefined) {
      try {
        scannedStats = scanWorkspace(nextRootPath)
        scannedStatus = 'ready'
      } catch {
        scannedStats = null
        scannedStatus = 'index-failed'
      }
    }
    const values = {
      ...rest,
      fileStatsJson: fileStats === undefined ? scannedStats === undefined ? undefined : scannedStats ? JSON.stringify(scannedStats) : null : fileStats ? JSON.stringify(fileStats) : null,
      ignoreRulesJson: ignoreRules === undefined ? undefined : ignoreRules ? JSON.stringify(ignoreRules) : null,
      indexStatus: data.indexStatus ?? scannedStatus,
      updatedAt: Date.now(),
    }
    db.update(projects)
      .set(values)
      .where(eq(projects.id, id))
      .run()
  },

  /** 删除项目（软删除） */
  delete(id: string): void {
    const db = getDb()
    db.update(projects)
      .set({ status: 'deleted', updatedAt: Date.now() })
      .where(eq(projects.id, id))
      .run()
  },
}
