import { tool } from 'ai'
import { z } from 'zod'
import { ApprovalStore } from '../../agent/approvalStore'
import { CheckpointStore } from '../../agent/checkpointStore'
import { ProjectStore } from '../../projects/projectStore'
import type { WorkspaceToolContext } from './workspace-files'

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/')
}

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法创建或恢复 checkpoint。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

function ensureRunContext(context: WorkspaceToolContext): { runId: string; threadId: string } {
  if (!context.runId || !context.threadId) throw new Error('当前运行缺少 AgentRun 上下文。')
  return { runId: context.runId, threadId: context.threadId }
}

export function createCheckpointTools(context: WorkspaceToolContext) {
  return {
    create_checkpoint: tool({
      description: '为当前 Workspace 内的一组文件创建可恢复快照。写入、移动、删除文件前必须先调用。',
      inputSchema: z.object({
        name: z.string().optional().describe('checkpoint 名称。'),
        paths: z.array(z.string()).min(1).max(100).describe('需要保护的 Workspace 相对文件路径列表。'),
      }),
      execute: async ({ name, paths }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const checkpoint = CheckpointStore.create({
            workspaceId: context.workspaceId ?? null,
            runId,
            rootPath,
            name,
            paths,
          })
          const protectedFiles = checkpoint.fileBackups.map((item) => item.path)
          const protectedSet = new Set(protectedFiles)
          const skippedPaths = [...new Set(paths.map(normalizeRelative))].filter((item) => !protectedSet.has(item))
          return {
            ok: true,
            checkpoint,
            checkpointId: checkpoint.id,
            protectedFiles,
            skippedPaths,
            skipped: skippedPaths.length > 0,
            message: skippedPaths.length > 0 && protectedFiles.length === 0 ? '目标是新文件，当前无需创建快照。' : undefined,
            contextFiles: protectedFiles,
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    compare_file_versions: tool({
      description: '比较 checkpoint 中的文件版本与当前 Workspace 文件版本，返回简要 diff 摘要。',
      inputSchema: z.object({
        checkpointId: z.string().describe('checkpoint id。'),
        path: z.string().describe('要对比的 Workspace 相对文件路径。'),
      }),
      execute: async ({ checkpointId, path }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          return { ok: true, checkpointId, diff: CheckpointStore.compareFile(checkpointId, rootPath, path), contextFiles: [path] }
        } catch (error) {
          return { ok: false, checkpointId, path, error: (error as Error).message, contextFiles: [path] }
        }
      },
    }),

    restore_checkpoint: tool({
      description: '从 checkpoint 恢复文件。默认只预览；真正恢复必须提供已批准的 approvalId 并设置 dryRun=false。',
      inputSchema: z.object({
        checkpointId: z.string().describe('checkpoint id。'),
        paths: z.array(z.string()).optional().describe('只恢复这些 Workspace 相对路径；不传则恢复整个 checkpoint。'),
        dryRun: z.boolean().default(true).describe('true 只预览，false 执行恢复。'),
        approvalId: z.string().optional().describe('用户批准恢复操作后得到的 approval id。'),
      }),
      execute: async ({ checkpointId, paths, dryRun, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId, threadId } = ensureRunContext(context)
          const checkpoint = CheckpointStore.get(checkpointId)
          if (!checkpoint) return { ok: false, checkpointId, error: 'Checkpoint 不存在', contextFiles: [] }
          if (!context.workspaceId || checkpoint.workspaceId !== context.workspaceId) {
            return { ok: false, checkpointId, error: 'Checkpoint 不属于当前 Workspace。', contextFiles: [] }
          }
          const affectedPaths = paths?.length ? paths : checkpoint.fileBackups.map((item) => item.path)

          if (dryRun) {
            return { ok: true, dryRun: true, checkpointId, affectedPaths, message: '预览完成，未恢复文件。', contextFiles: affectedPaths }
          }

          if (approvalId) {
            const approval = ApprovalStore.get(approvalId)
            const approvalMatches = Boolean(
              approval &&
              approval.status === 'approved' &&
              approval.workspaceId === context.workspaceId &&
              approval.toolName === 'restore_checkpoint' &&
              approval.action === '恢复 checkpoint' &&
              approval.checkpointId === checkpointId &&
              affectedPaths.every((item) => approval.affectedPaths.includes(item))
            )
            if (!approvalMatches) {
              return { ok: false, approvalRequired: true, checkpointId, approvalId, error: '恢复 checkpoint 需要与当前 Workspace、快照和路径完全匹配的审批记录。', contextFiles: affectedPaths }
            }
            const result = CheckpointStore.restore(checkpointId, rootPath, paths)
            return { ok: true, checkpointId, ...result, contextFiles: result.restored }
          }

          const approval = ApprovalStore.create({
            runId,
            threadId,
            workspaceId: context.workspaceId ?? null,
            action: '恢复 checkpoint',
            toolName: 'restore_checkpoint',
            riskLevel: 'medium',
            reason: '恢复 checkpoint 会覆盖当前 Workspace 中的文件，需要用户确认。',
            affectedPaths,
            checkpointRequired: false,
            checkpointId,
          })
          return { ok: false, approvalRequired: true, approvalId: approval.id, approval, checkpointId, affectedPaths, contextFiles: affectedPaths }
        } catch (error) {
          return { ok: false, checkpointId, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}
