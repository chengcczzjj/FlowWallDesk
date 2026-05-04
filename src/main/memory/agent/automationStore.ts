import { and, desc, eq, lte, ne } from 'drizzle-orm'
import { ulid } from 'ulidx'
import { getDb, getRawDb } from '../db/client'
import { automations, automationRuns } from '../db/schema'
import type { AgentAutomation, AgentAutomationResult, AgentAutomationRunStatus, AgentAutomationScheduleType, AgentAutomationStatus } from '@shared/types'

interface AutomationRow extends Omit<AgentAutomation, 'scheduleType' | 'status'> {
  scheduleType: string
  status: string
}

interface AutomationRunRow extends Omit<AgentAutomationResult, 'status'> {
  status: string
}

export interface CreateAutomationInput {
  name: string
  prompt: string
  workspaceId?: string | null
  conversationId?: string | null
  scheduleType?: AgentAutomationScheduleType
  intervalMinutes?: number | null
  timeOfDay?: string | null
}

export interface UpdateAutomationInput extends Partial<CreateAutomationInput> {
  status?: AgentAutomationStatus
}

function toAutomation(row: AutomationRow): AgentAutomation {
  return {
    ...row,
    scheduleType: row.scheduleType as AgentAutomationScheduleType,
    status: row.status as AgentAutomationStatus,
  }
}

function toResult(row: AutomationRunRow): AgentAutomationResult {
  return { ...row, status: row.status as AgentAutomationRunStatus }
}

function parseTimeOfDay(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function computeNextRunAt(input: Pick<AgentAutomation, 'scheduleType' | 'intervalMinutes' | 'timeOfDay'>, from = Date.now()): number | null {
  if (input.scheduleType === 'manual') return null
  if (input.scheduleType === 'interval') {
    const minutes = Math.max(1, input.intervalMinutes ?? 60)
    return from + minutes * 60_000
  }
  const time = parseTimeOfDay(input.timeOfDay)
  if (!time) return null
  const next = new Date(from)
  next.setHours(time.hour, time.minute, 0, 0)
  if (next.getTime() <= from) next.setDate(next.getDate() + 1)
  return next.getTime()
}

export const AutomationStore = {
  create(data: CreateAutomationInput): AgentAutomation {
    const db = getDb()
    const now = Date.now()
    const scheduleType = data.scheduleType ?? 'manual'
    const row: AgentAutomation = {
      id: ulid(),
      name: data.name.trim() || '自动化任务',
      prompt: data.prompt,
      workspaceId: data.workspaceId ?? null,
      conversationId: data.conversationId ?? null,
      scheduleType,
      intervalMinutes: data.intervalMinutes ?? null,
      timeOfDay: data.timeOfDay ?? null,
      nextRunAt: computeNextRunAt({ scheduleType, intervalMinutes: data.intervalMinutes ?? null, timeOfDay: data.timeOfDay ?? null }, now),
      lastRunAt: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    db.insert(automations).values(row).run()
    return row
  },

  get(id: string): AgentAutomation | null {
    const row = getDb().select().from(automations).where(eq(automations.id, id)).get() as AutomationRow | undefined
    return row ? toAutomation(row) : null
  },

  list(limit = 50): AgentAutomation[] {
    return getDb()
      .select()
      .from(automations)
      .where(ne(automations.status, 'deleted'))
      .orderBy(desc(automations.updatedAt))
      .limit(limit)
      .all()
      .map((row) => toAutomation(row as AutomationRow))
  },

  listDue(now = Date.now(), limit = 5): AgentAutomation[] {
    return getDb()
      .select()
      .from(automations)
      .where(and(eq(automations.status, 'active'), lte(automations.nextRunAt, now)))
      .orderBy(automations.nextRunAt)
      .limit(limit)
      .all()
      .map((row) => toAutomation(row as AutomationRow))
  },

  update(id: string, data: UpdateAutomationInput): AgentAutomation | null {
    const current = this.get(id)
    if (!current) return null
    const nextSchedule = data.scheduleType ?? current.scheduleType
    const nextInterval = data.intervalMinutes === undefined ? current.intervalMinutes : data.intervalMinutes
    const nextTimeOfDay = data.timeOfDay === undefined ? current.timeOfDay : data.timeOfDay
    const now = Date.now()
    getDb().update(automations)
      .set({
        name: data.name ?? current.name,
        prompt: data.prompt ?? current.prompt,
        workspaceId: data.workspaceId === undefined ? current.workspaceId : data.workspaceId,
        conversationId: data.conversationId === undefined ? current.conversationId : data.conversationId,
        scheduleType: nextSchedule,
        intervalMinutes: nextInterval,
        timeOfDay: nextTimeOfDay,
        status: data.status ?? current.status,
        nextRunAt: data.status === 'paused' ? null : computeNextRunAt({ scheduleType: nextSchedule, intervalMinutes: nextInterval, timeOfDay: nextTimeOfDay }, now),
        updatedAt: now,
      })
      .where(eq(automations.id, id))
      .run()
    return this.get(id)
  },

  softDelete(id: string): boolean {
    getDb().update(automations).set({ status: 'deleted', updatedAt: Date.now() }).where(eq(automations.id, id)).run()
    return true
  },

  hasRunningResult(automationId: string): boolean {
    const row = getRawDb().prepare(`SELECT id FROM automation_runs WHERE automation_id = ? AND status = 'running' LIMIT 1`).get(automationId)
    return Boolean(row)
  },

  createResult(automationId: string): AgentAutomationResult {
    const row: AgentAutomationResult = {
      id: ulid(),
      automationId,
      runId: null,
      status: 'running',
      summary: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    }
    getDb().insert(automationRuns).values(row).run()
    return row
  },

  updateResult(id: string, data: Partial<Pick<AgentAutomationResult, 'runId' | 'status' | 'summary' | 'error' | 'finishedAt'>>): AgentAutomationResult | null {
    getDb().update(automationRuns).set(data).where(eq(automationRuns.id, id)).run()
    const row = getDb().select().from(automationRuns).where(eq(automationRuns.id, id)).get() as AutomationRunRow | undefined
    return row ? toResult(row) : null
  },

  finishSchedule(automationId: string, completedAt = Date.now()): AgentAutomation | null {
    const current = this.get(automationId)
    if (!current) return null
    getDb().update(automations)
      .set({
        lastRunAt: completedAt,
        nextRunAt: current.status === 'active' ? computeNextRunAt(current, completedAt) : null,
        updatedAt: completedAt,
      })
      .where(eq(automations.id, automationId))
      .run()
    return this.get(automationId)
  },

  listResults(automationId?: string, limit = 30): AgentAutomationResult[] {
    const query = getDb().select().from(automationRuns)
    const rows = automationId
      ? query.where(eq(automationRuns.automationId, automationId)).orderBy(desc(automationRuns.startedAt)).limit(limit).all()
      : query.orderBy(desc(automationRuns.startedAt)).limit(limit).all()
    return rows.map((row) => toResult(row as AutomationRunRow))
  },
}