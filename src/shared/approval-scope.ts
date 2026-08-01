import type { AgentApproval } from './types'

export interface ApprovalAccessRequest {
  workspaceId?: string | null
  toolName: string
  action: string
  affectedPaths?: string[]
  command?: string
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '').toLocaleLowerCase()
}

export function approvalMatchesRequest(
  approval: Pick<AgentApproval, 'workspaceId' | 'toolName' | 'action' | 'affectedPaths' | 'command'>,
  request: ApprovalAccessRequest,
): boolean {
  if (approval.workspaceId !== (request.workspaceId ?? null)) return false
  if (approval.toolName !== request.toolName || approval.action !== request.action) return false
  if ((approval.command ?? null) !== (request.command ?? null)) return false
  const grantedPaths = new Set(approval.affectedPaths.map(normalizePath))
  return [...new Set(request.affectedPaths ?? [])]
    .map(normalizePath)
    .every((path) => grantedPaths.has(path))
}

