import { ulid } from 'ulidx'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { artifacts } from '../db/schema'
import { AgentRunStore } from './agentRunStore'
import type { AgentArtifact, AgentArtifactPreviewType, AgentArtifactType } from '@shared/types'

interface ArtifactRow {
  id: string
  runId: string
  workspaceId: string | null
  name: string
  path: string
  type: AgentArtifactType | string
  previewType: AgentArtifactPreviewType | string
  sourceFilesJson: string
  size: number
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

function toArtifact(row: ArtifactRow): AgentArtifact {
  return {
    id: row.id,
    runId: row.runId,
    workspaceId: row.workspaceId,
    name: row.name,
    path: row.path,
    type: row.type as AgentArtifactType,
    previewType: row.previewType as AgentArtifactPreviewType,
    sourceFiles: parseJson<string[]>(row.sourceFilesJson, []),
    size: row.size,
    createdAt: row.createdAt,
  }
}

function syncRunArtifacts(runId: string): AgentArtifact[] {
  const artifactsForRun = ArtifactStore.listByRun(runId)
  AgentRunStore.updateArtifacts(runId, artifactsForRun)
  return artifactsForRun
}

export const ArtifactStore = {
  create(data: {
    runId: string
    workspaceId?: string | null
    name: string
    path: string
    type: AgentArtifactType
    previewType: AgentArtifactPreviewType
    sourceFiles?: string[]
    size?: number
  }): AgentArtifact {
    const db = getDb()
    const row = {
      id: ulid(),
      runId: data.runId,
      workspaceId: data.workspaceId ?? null,
      name: data.name,
      path: data.path,
      type: data.type,
      previewType: data.previewType,
      sourceFilesJson: JSON.stringify(data.sourceFiles ?? []),
      size: data.size ?? 0,
      createdAt: Date.now(),
    }
    db.insert(artifacts).values(row).run()
    const artifact = toArtifact(row)
    syncRunArtifacts(data.runId)
    return artifact
  },

  get(id: string): AgentArtifact | undefined {
    const db = getDb()
    const row = db.select().from(artifacts).where(eq(artifacts.id, id)).get() as ArtifactRow | undefined
    return row ? toArtifact(row) : undefined
  },

  listByRun(runId: string, limit = 50): AgentArtifact[] {
    const db = getDb()
    return db.select()
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(desc(artifacts.createdAt))
      .limit(limit)
      .all()
      .map((row) => toArtifact(row as ArtifactRow))
  },
}