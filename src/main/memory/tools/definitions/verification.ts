import { tool } from 'ai'
import { z } from 'zod'
import { AgentRunStore } from '../../agent/agentRunStore'
import { VerificationEngine } from '../../agent/verificationEngine'
import { ProjectStore } from '../../projects/projectStore'
import type { WorkspaceToolContext } from './workspace-files'

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法验证结果。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

export function createVerificationTools(context: WorkspaceToolContext) {
  return {
    verify_workspace_result: tool({
      description: '验证当前 Workspace 内的任务结果，例如文件/目录是否存在、文件是否包含预期文本、Artifact 是否已经生成。验证结果会同步到 AgentRun。',
      inputSchema: z.object({
        checks: z.array(z.object({
          type: z.enum(['file_exists', 'directory_exists', 'contains_text', 'not_contains_text']),
          path: z.string().describe('Workspace 相对路径。'),
          text: z.string().optional().describe('内容验证时使用的文本。'),
          name: z.string().optional().describe('验证项名称。'),
        })).default([]),
        artifactIds: z.array(z.string()).default([]).describe('需要验证的 Artifact id。'),
      }),
      execute: async ({ checks, artifactIds }) => {
        try {
          if (!context.runId) throw new Error('当前运行缺少 AgentRun 上下文。')
          const rootPath = getWorkspaceRoot(context)
          const verification = VerificationEngine.verifyWorkspace(rootPath, checks, artifactIds)
          AgentRunStore.updateVerification(context.runId, verification)
          return { ok: true, verification, contextFiles: checks.map((item) => item.path) }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}