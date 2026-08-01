import type { AgentAutomationRunStatus } from './types'

export type ChatTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'waiting-approval'

export function automationStatusFromChat(status: ChatTerminalStatus): {
  status: AgentAutomationRunStatus
  error?: string
} {
  if (status === 'completed') return { status: 'completed' }
  if (status === 'cancelled') return { status: 'cancelled' }
  if (status === 'waiting-approval') {
    return { status: 'failed', error: '自动化任务需要人工授权，未继续执行。' }
  }
  return { status: 'failed' }
}

