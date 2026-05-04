import { ulid } from 'ulidx'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { fileChanges } from '../db/schema'
import { AgentRunStore } from './agentRunStore'
import type { AgentFileChange, AgentFileChangeReviewState, AgentFileChangeType } from '@shared/types'

interface FileChangeRow {
  id: string
  runId: string
  type: AgentFileChangeType | string
  path: string
  oldPath: string | null
  backupPath: string | null
  diff: string | null
  reason: string
  toolCallId: string | null
  checkpointId: string | null
  reviewState: AgentFileChangeReviewState | string
  createdAt: number
}

function toFileChange(row: FileChangeRow): AgentFileChange {
  return {
    id: row.id,
    runId: row.runId,
    type: row.type as AgentFileChangeType,
    path: row.path,
    oldPath: row.oldPath,
    backupPath: row.backupPath,
    diff: row.diff,
    reason: row.reason,
    toolCallId: row.toolCallId,
    checkpointId: row.checkpointId,
    reviewState: row.reviewState as AgentFileChangeReviewState,
    createdAt: row.createdAt,
  }
}

function syncRunFileChanges(runId: string): AgentFileChange[] {
  const changes = FileChangeStore.listByRun(runId)
  AgentRunStore.updateFileChanges(runId, changes)
  return changes
}

export const FileChangeStore = {
  create(data: {
    runId: string
    type: AgentFileChangeType
    path: string
    oldPath?: string | null
    backupPath?: string | null
    diff?: string | null
    reason: string
    toolCallId?: string | null
    checkpointId?: string | null
  }): AgentFileChange {
    const db = getDb()
    const row = {
      id: ulid(),
      runId: data.runId,
      type: data.type,
      path: data.path,
      oldPath: data.oldPath ?? null,
      backupPath: data.backupPath ?? null,
      diff: data.diff ?? null,
      reason: data.reason,
      toolCallId: data.toolCallId ?? null,
      checkpointId: data.checkpointId ?? null,
      reviewState: 'pending' as const,
      createdAt: Date.now(),
    }
    db.insert(fileChanges).values(row).run()
    const change = toFileChange(row)
    syncRunFileChanges(data.runId)
    return change
  },

  listByRun(runId: string, limit = 100): AgentFileChange[] {
    const db = getDb()
    return db.select()
      .from(fileChanges)
      .where(eq(fileChanges.runId, runId))
      .orderBy(desc(fileChanges.createdAt))
      .limit(limit)
      .all()
      .map((row) => toFileChange(row as FileChangeRow))
  },

  get(id: string): AgentFileChange | undefined {
    const db = getDb()
    const row = db.select().from(fileChanges).where(eq(fileChanges.id, id)).get() as FileChangeRow | undefined
    return row ? toFileChange(row) : undefined
  },

  updateReviewState(id: string, reviewState: AgentFileChangeReviewState): AgentFileChange | undefined {
    const db = getDb()
    const existing = this.get(id)
    if (!existing) return undefined
    db.update(fileChanges)
      .set({ reviewState })
      .where(eq(fileChanges.id, id))
      .run()
    const updated = this.get(id)
    syncRunFileChanges(existing.runId)
    return updated
  },
}