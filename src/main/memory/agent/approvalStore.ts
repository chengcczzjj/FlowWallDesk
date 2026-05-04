import { ulid } from 'ulidx'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { approvals } from '../db/schema'
import { AgentRunStore } from './agentRunStore'
import type { AgentApproval, AgentApprovalDecision, AgentApprovalRiskLevel, AgentApprovalStatus, AgentRun } from '@shared/types'

interface ApprovalRow {
  id: string
  runId: string
  threadId: string
  workspaceId: string | null
  action: string
  toolName: string | null
  riskLevel: AgentApprovalRiskLevel | string
  reason: string
  affectedPathsJson: string
  command: string | null
  checkpointRequired: number
  checkpointId: string | null
  status: AgentApprovalStatus | string
  decision: AgentApprovalDecision | string | null
  createdAt: number
  resolvedAt: number | null
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toApproval(row: ApprovalRow): AgentApproval {
  return {
    id: row.id,
    runId: row.runId,
    threadId: row.threadId,
    workspaceId: row.workspaceId,
    action: row.action,
    toolName: row.toolName,
    riskLevel: row.riskLevel as AgentApprovalRiskLevel,
    reason: row.reason,
    affectedPaths: parseJson<string[]>(row.affectedPathsJson, []),
    command: row.command,
    checkpointRequired: Boolean(row.checkpointRequired),
    checkpointId: row.checkpointId,
    status: row.status as AgentApprovalStatus,
    decision: row.decision as AgentApprovalDecision | null,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }
}

function syncRunApprovals(runId: string): AgentRun | undefined {
  const approvalsForRun = ApprovalStore.listByRun(runId)
  return AgentRunStore.updateApprovals(runId, approvalsForRun)
}

export const ApprovalStore = {
  create(data: {
    runId: string
    threadId: string
    workspaceId?: string | null
    action: string
    toolName?: string | null
    riskLevel: AgentApprovalRiskLevel
    reason: string
    affectedPaths?: string[]
    command?: string | null
    checkpointRequired?: boolean
    checkpointId?: string | null
  }): AgentApproval {
    const db = getDb()
    const now = Date.now()
    const row = {
      id: ulid(),
      runId: data.runId,
      threadId: data.threadId,
      workspaceId: data.workspaceId ?? null,
      action: data.action,
      toolName: data.toolName ?? null,
      riskLevel: data.riskLevel,
      reason: data.reason,
      affectedPathsJson: JSON.stringify(data.affectedPaths ?? []),
      command: data.command ?? null,
      checkpointRequired: data.checkpointRequired ? 1 : 0,
      checkpointId: data.checkpointId ?? null,
      status: 'pending' as const,
      decision: null,
      createdAt: now,
      resolvedAt: null,
    }
    db.insert(approvals).values(row).run()
    const approval = toApproval(row)
    syncRunApprovals(data.runId)
    return approval
  },

  resolve(id: string, decision: AgentApprovalDecision): AgentApproval | undefined {
    const db = getDb()
    const existing = this.get(id)
    if (!existing) return undefined

    const status: AgentApprovalStatus = decision === 'deny' ? 'denied' : 'approved'
    db.update(approvals)
      .set({ status, decision, resolvedAt: Date.now() })
      .where(eq(approvals.id, id))
      .run()

    const updated = this.get(id)
    if (updated) syncRunApprovals(updated.runId)
    return updated
  },

  get(id: string): AgentApproval | undefined {
    const db = getDb()
    const row = db.select().from(approvals).where(eq(approvals.id, id)).get() as ApprovalRow | undefined
    return row ? toApproval(row) : undefined
  },

  listByRun(runId: string, limit = 50): AgentApproval[] {
    const db = getDb()
    return db.select()
      .from(approvals)
      .where(eq(approvals.runId, runId))
      .orderBy(desc(approvals.createdAt))
      .limit(limit)
      .all()
      .map((row) => toApproval(row as ApprovalRow))
  },

  hasApprovedAccess(params: { approvalId?: string; workspaceId?: string | null; toolName: string; action: string; affectedPaths?: string[]; command?: string }): boolean {
    if (params.approvalId) {
      const approval = this.get(params.approvalId)
      if (
        approval?.status === 'approved' &&
        (!params.workspaceId || approval.workspaceId === params.workspaceId) &&
        (approval.toolName === params.toolName || approval.action === params.action) &&
        (!params.command || approval.command === params.command) &&
        (!params.affectedPaths?.length || params.affectedPaths.every((item) => approval.affectedPaths.includes(item)))
      ) return true
    }
    if (!params.workspaceId) return false
    const db = getDb()
    const rows = db.select().from(approvals).where(eq(approvals.workspaceId, params.workspaceId)).all() as ApprovalRow[]
    return rows
      .map(toApproval)
      .some((approval) =>
        approval.status === 'approved' &&
        approval.decision === 'allow-workspace' &&
        (approval.toolName === params.toolName || approval.action === params.action)
      )
  },
}