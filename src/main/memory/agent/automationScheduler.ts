import { AutomationStore } from './automationStore'
import { ChatService } from '../chat/chatService'
import type { AgentAutomation } from '@shared/types'
import { automationStatusFromChat } from '@shared/agent-runtime'

let timer: ReturnType<typeof setInterval> | null = null
let ticking = false

async function executeAutomation(automation: AgentAutomation): Promise<void> {
  if (AutomationStore.hasRunningResult(automation.id)) return
  const result = AutomationStore.createResult(automation.id)
  let runId: string | null = null
  let summary = ''
  try {
    const terminal = await ChatService.sendMessage(
      {
        conversationId: automation.conversationId ?? undefined,
        projectId: automation.workspaceId,
        mode: 'work',
        text: automation.prompt,
      },
      {
        onToken(delta) {
          summary += delta
        },
        onDone(full) {
          summary = full || summary
        },
        onError(error) {
          summary ||= error
        },
        onRunEvent(event) {
          if (!runId && event.runId) {
            runId = event.runId
            AutomationStore.updateResult(result.id, { runId })
          }
        },
      }
    )

    const terminalState = automationStatusFromChat(terminal.status)
    const error = terminalState.error ?? terminal.error

    AutomationStore.updateResult(result.id, {
      runId: terminal.runId ?? runId,
      status: terminalState.status,
      summary: (terminal.text || summary).slice(0, 1000) || null,
      error: error || null,
      finishedAt: Date.now(),
    })
  } catch (error) {
    AutomationStore.updateResult(result.id, {
      runId,
      status: 'failed',
      error: (error as Error).message,
      summary: summary.slice(0, 1000) || null,
      finishedAt: Date.now(),
    })
  } finally {
    AutomationStore.finishSchedule(automation.id)
  }
}

export async function runAutomationNow(id: string): Promise<{ ok: boolean; error?: string }> {
  const automation = AutomationStore.get(id)
  if (!automation || automation.status === 'deleted') return { ok: false, error: '自动化任务不存在。' }
  if (AutomationStore.hasRunningResult(id)) return { ok: false, error: '该自动化任务正在运行。' }
  await executeAutomation(automation)
  return { ok: true }
}

async function tickAutomations(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const due = AutomationStore.listDue(Date.now(), 3)
    for (const automation of due) {
      await executeAutomation(automation)
    }
  } finally {
    ticking = false
  }
}

export function startAutomationScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void tickAutomations()
  }, 60_000)
  void tickAutomations()
}

export function stopAutomationScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
