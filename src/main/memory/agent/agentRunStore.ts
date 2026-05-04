import { ulid } from 'ulidx'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { agentRuns } from '../db/schema'
import type { AgentApproval, AgentArtifact, AgentCheckpoint, AgentFileChange, AgentPlanStep, AgentRun, AgentRunStatus, AgentRunVerification } from '@shared/types'

interface AgentRunRow {
  id: string
  threadId: string
  workspaceId: string | null
  status: AgentRunStatus | string
  intent: string
  planJson: string
  contextFilesJson: string
  toolCallsJson: string
  approvalsJson: string
  checkpointsJson: string
  fileChangesJson: string
  artifactsJson: string
  verificationJson: string | null
  summary: string | null
  startedAt: number
  finishedAt: number | null
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    threadId: row.threadId,
    workspaceId: row.workspaceId,
    status: row.status as AgentRunStatus,
    intent: row.intent,
    plan: parseJson<AgentPlanStep[]>(row.planJson, []),
    contextFiles: parseJson<string[]>(row.contextFilesJson, []),
    toolCalls: parseJson<string[]>(row.toolCallsJson, []),
    approvals: parseJson<AgentApproval[]>(row.approvalsJson, []),
    checkpoints: parseJson<AgentCheckpoint[]>(row.checkpointsJson, []),
    fileChanges: parseJson<AgentFileChange[]>(row.fileChangesJson, []),
    artifacts: parseJson<AgentArtifact[]>(row.artifactsJson, []),
    verification: parseJson<AgentRunVerification | null>(row.verificationJson, null),
    summary: row.summary,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  }
}

export const AgentRunStore = {
  create(data: { threadId: string; workspaceId?: string | null; intent: string; status?: AgentRunStatus; plan?: AgentPlanStep[] }): AgentRun {
    const db = getDb()
    const now = Date.now()
    const row = {
      id: ulid(),
      threadId: data.threadId,
      workspaceId: data.workspaceId ?? null,
      status: data.status ?? 'scoping',
      intent: data.intent,
      planJson: JSON.stringify(data.plan ?? []),
      contextFilesJson: '[]',
      toolCallsJson: '[]',
      approvalsJson: '[]',
      checkpointsJson: '[]',
      fileChangesJson: '[]',
      artifactsJson: '[]',
      verificationJson: null,
      summary: null,
      startedAt: now,
      finishedAt: null,
    }
    db.insert(agentRuns).values(row).run()
    return toAgentRun(row)
  },

  updateStatus(id: string, status: AgentRunStatus, summary?: string): void {
    const db = getDb()
    const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled'
    db.update(agentRuns)
      .set({ status, summary, finishedAt: isTerminal ? Date.now() : null })
      .where(eq(agentRuns.id, id))
      .run()
  },

  appendToolCall(id: string, toolName: string): AgentRun | undefined {
    const db = getDb()
    const run = this.get(id)
    if (!run) return undefined
    const toolCalls = [...run.toolCalls, toolName]
    db.update(agentRuns)
      .set({ toolCallsJson: JSON.stringify(toolCalls) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updatePlan(id: string, plan: AgentPlanStep[]): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ planJson: JSON.stringify(plan) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updateApprovals(id: string, approvals: AgentApproval[]): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ approvalsJson: JSON.stringify(approvals) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updateCheckpoints(id: string, checkpoints: AgentCheckpoint[]): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ checkpointsJson: JSON.stringify(checkpoints) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updateFileChanges(id: string, fileChanges: AgentFileChange[]): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ fileChangesJson: JSON.stringify(fileChanges) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updateArtifacts(id: string, artifacts: AgentArtifact[]): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ artifactsJson: JSON.stringify(artifacts) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  updateVerification(id: string, verification: AgentRunVerification): AgentRun | undefined {
    const db = getDb()
    db.update(agentRuns)
      .set({ verificationJson: JSON.stringify(verification) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  appendContextFiles(id: string, files: string[]): AgentRun | undefined {
    const db = getDb()
    const run = this.get(id)
    if (!run) return undefined
    const cleaned = files
      .filter((file) => typeof file === 'string' && file.trim().length > 0)
      .map((file) => file.replace(/\\/g, '/'))
    const contextFiles = [...new Set([...run.contextFiles, ...cleaned])]
    db.update(agentRuns)
      .set({ contextFilesJson: JSON.stringify(contextFiles) })
      .where(eq(agentRuns.id, id))
      .run()
    return this.get(id)
  },

  get(id: string): AgentRun | undefined {
    const db = getDb()
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get() as AgentRunRow | undefined
    return row ? toAgentRun(row) : undefined
  },

  listByThread(threadId: string, limit = 20): AgentRun[] {
    const db = getDb()
    return db.select()
      .from(agentRuns)
      .where(eq(agentRuns.threadId, threadId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(limit)
      .all()
      .map((row) => toAgentRun(row as AgentRunRow))
  },
}