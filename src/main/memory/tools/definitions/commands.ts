import { spawn } from 'node:child_process'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { ApprovalStore } from '../../agent/approvalStore'
import { RunCancellation } from '../../agent/runCancellation'
import { ProjectStore } from '../../projects/projectStore'
import { evaluateWorkspaceAccess } from '../../security/permissionEngine'
import type { WorkspaceToolContext } from './workspace-files'

const MAX_OUTPUT_CHARS = 20_000
const BLOCKED_COMMANDS = new Set(['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'bash', 'sh', 'wscript', 'cscript', 'reg', 'reg.exe', 'shutdown', 'shutdown.exe', 'format', 'format.com'])

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法运行命令。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

function ensureRunContext(context: WorkspaceToolContext): { runId: string; threadId: string } {
  if (!context.runId || !context.threadId) throw new Error('当前运行缺少 AgentRun 上下文。')
  return { runId: context.runId, threadId: context.threadId }
}

function normalizeCommandName(command: string): string {
  return path.basename(command).toLowerCase()
}

function truncateOutput(value: string): string {
  return value.length > MAX_OUTPUT_CHARS ? value.slice(-MAX_OUTPUT_CHARS) : value
}

function requireApproval(context: WorkspaceToolContext, params: { commandLine: string; cwd: string; approvalId?: string }) {
  const { runId, threadId } = ensureRunContext(context)
  if (ApprovalStore.hasApprovedAccess({ approvalId: params.approvalId, workspaceId: context.workspaceId, toolName: 'run_command', action: '运行命令', affectedPaths: [params.cwd], command: params.commandLine })) {
    return null
  }
  return ApprovalStore.create({
    runId,
    threadId,
    workspaceId: context.workspaceId ?? null,
    action: '运行命令',
    toolName: 'run_command',
    riskLevel: 'high',
    reason: `Agent 想在 Workspace 内运行命令: ${params.commandLine}`,
    affectedPaths: [params.cwd],
    command: params.commandLine,
    checkpointRequired: false,
  })
}

function runProcess(params: { command: string; args: string[]; cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<{ exitCode: number | null; timedOut: boolean; aborted: boolean; stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let settled = false
    if (params.signal?.aborted) {
      resolve({ exitCode: null, timedOut: false, aborted: true, stdout, stderr: '命令已停止。', durationMs: 0 })
      return
    }
    const child = spawn(params.command, params.args, { cwd: params.cwd, shell: false, windowsHide: true })
    const finish = (value: { exitCode: number | null; timedOut: boolean; aborted: boolean; stdout: string; stderr: string; durationMs: number }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      params.signal?.removeEventListener('abort', abort)
      resolve(value)
    }
    const abort = () => {
      child.kill()
      finish({ exitCode: null, timedOut: false, aborted: true, stdout: truncateOutput(stdout), stderr: truncateOutput(stderr || '命令已停止。'), durationMs: Date.now() - startedAt })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ exitCode: null, timedOut: true, aborted: false, stdout: truncateOutput(stdout), stderr: truncateOutput(stderr), durationMs: Date.now() - startedAt })
    }, params.timeoutMs)
    params.signal?.addEventListener('abort', abort, { once: true })

    child.stdout?.on('data', (chunk) => {
      stdout = truncateOutput(stdout + String(chunk))
    })
    child.stderr?.on('data', (chunk) => {
      stderr = truncateOutput(stderr + String(chunk))
    })
    child.on('error', (error) => {
      finish({ exitCode: null, timedOut: false, aborted: false, stdout: truncateOutput(stdout), stderr: truncateOutput(stderr + error.message), durationMs: Date.now() - startedAt })
    })
    child.on('close', (exitCode) => {
      finish({ exitCode, timedOut: false, aborted: false, stdout: truncateOutput(stdout), stderr: truncateOutput(stderr), durationMs: Date.now() - startedAt })
    })
  })
}

export function createCommandTools(context: WorkspaceToolContext) {
  return {
    run_command: tool({
      description: '在当前 Workspace 内运行受审批保护的本地命令。只支持直接命令和参数，不支持 shell 管道、重定向或内联脚本。',
      inputSchema: z.object({
        command: z.string().describe('可执行命令名，例如 npm、node、python。不能是 cmd/powershell/bash。'),
        args: z.array(z.string()).default([]).describe('命令参数数组，例如 ["run", "test"]。'),
        cwd: z.string().default('.').describe('Workspace 相对工作目录。'),
        timeoutMs: z.number().min(1000).max(120_000).default(30_000).describe('超时时间，默认 30 秒，最大 120 秒。'),
        approvalId: z.string().optional().describe('已批准的审批 id。'),
      }),
      execute: async ({ command, args, cwd, timeoutMs, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          if (BLOCKED_COMMANDS.has(normalizeCommandName(command))) {
            return { ok: false, error: '当前版本不允许通过 shell 或系统管理命令执行。请改用直接命令和参数。', contextFiles: [] }
          }
          const cwdPermission = evaluateWorkspaceAccess({ rootPath, inputPath: cwd, operation: 'get_file_info' })
          if (cwdPermission.decision === 'denied' || !cwdPermission.resolvedPath) {
            return { ok: false, error: cwdPermission.reason, contextFiles: [] }
          }
          const commandLine = [command, ...args].join(' ')
          const approval = requireApproval(context, { commandLine, cwd: cwdPermission.relativePath, approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [cwdPermission.relativePath] }

          const result = await runProcess({ command, args, cwd: cwdPermission.resolvedPath, timeoutMs, signal: RunCancellation.getSignal(runId) })
          return {
            ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
            command: commandLine,
            cwd: cwdPermission.relativePath,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            aborted: result.aborted,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: result.durationMs,
            contextFiles: [cwdPermission.relativePath],
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}