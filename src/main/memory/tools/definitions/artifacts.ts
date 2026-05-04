import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { ApprovalStore } from '../../agent/approvalStore'
import { ArtifactStore } from '../../agent/artifactStore'
import { CheckpointStore } from '../../agent/checkpointStore'
import { FileChangeStore } from '../../agent/fileChangeStore'
import { ProjectStore } from '../../projects/projectStore'
import { evaluateWorkspaceAccess, shouldAutoApproveWorkspaceTool } from '../../security/permissionEngine'
import type { WorkspaceToolContext } from './workspace-files'
import type { AgentArtifactPreviewType, AgentArtifactType } from '@shared/types'

const ARTIFACT_TYPE_SCHEMA = z.enum(['markdown', 'text', 'csv', 'json', 'html', 'document', 'spreadsheet', 'image', 'other'])
const PREVIEW_TYPE_SCHEMA = z.enum(['markdown', 'text', 'table', 'html', 'image', 'none'])

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法生成产物。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

function ensureRunContext(context: WorkspaceToolContext): { runId: string; threadId: string } {
  if (!context.runId || !context.threadId) throw new Error('当前运行缺少 AgentRun 上下文。')
  return { runId: context.runId, threadId: context.threadId }
}

function resolveArtifactPath(rootPath: string, inputPath: string) {
  const permission = evaluateWorkspaceAccess({ rootPath, inputPath, operation: 'write_file' })
  if (permission.decision === 'denied') throw new Error(permission.reason)
  if (!permission.resolvedPath) throw new Error(permission.reason)
  return { absolutePath: permission.resolvedPath, relativePath: permission.relativePath, permission }
}

function inferTypeFromPath(inputPath: string): AgentArtifactType {
  const ext = path.extname(inputPath).toLowerCase()
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.txt' || ext === '.log') return 'text'
  if (ext === '.csv') return 'csv'
  if (ext === '.json') return 'json'
  if (ext === '.html' || ext === '.htm') return 'html'
  return 'other'
}

function inferPreviewType(type: AgentArtifactType): AgentArtifactPreviewType {
  if (type === 'markdown') return 'markdown'
  if (type === 'csv') return 'table'
  if (type === 'html') return 'html'
  if (type === 'text' || type === 'json') return 'text'
  if (type === 'image') return 'image'
  return 'none'
}

function requireApproval(context: WorkspaceToolContext, params: {
  action: string
  toolName: string
  reason: string
  affectedPaths: string[]
  approvalId?: string
  checkpointId?: string | null
}) {
  const { runId, threadId } = ensureRunContext(context)
  if (ApprovalStore.hasApprovedAccess({ approvalId: params.approvalId, workspaceId: context.workspaceId, toolName: params.toolName, action: params.action, affectedPaths: params.affectedPaths })) {
    return null
  }
  const permissionProfile = context.workspaceId ? ProjectStore.get(context.workspaceId)?.permissionProfile : null
  if (shouldAutoApproveWorkspaceTool({ permissionProfile, toolName: params.toolName, riskLevel: 'medium', affectedPaths: params.affectedPaths })) {
    return null
  }
  return ApprovalStore.create({
    runId,
    threadId,
    workspaceId: context.workspaceId ?? null,
    action: params.action,
    toolName: params.toolName,
    riskLevel: 'medium',
    reason: params.reason,
    affectedPaths: params.affectedPaths,
    checkpointRequired: true,
    checkpointId: params.checkpointId ?? null,
  })
}

function createCheckpointIfNeeded(context: WorkspaceToolContext, rootPath: string, relativePath: string) {
  const { runId } = ensureRunContext(context)
  const absolutePath = path.resolve(rootPath, relativePath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null
  return CheckpointStore.create({ workspaceId: context.workspaceId ?? null, runId, rootPath, name: `Before generate_artifact ${relativePath}`, paths: [relativePath] })
}

export function createArtifactTools(context: WorkspaceToolContext) {
  return {
    generate_artifact: tool({
      description: '在当前 Workspace 内生成可交付产物文件，例如 Markdown 报告、CSV、HTML、JSON 或纯文本。会登记 Artifact 记录，并在需要时请求审批。',
      inputSchema: z.object({
        name: z.string().optional().describe('产物显示名称。默认使用目标文件名。'),
        path: z.string().describe('Workspace 相对输出路径，例如 outputs/summary.md。'),
        content: z.string().describe('要写入产物文件的完整文本内容。'),
        type: ARTIFACT_TYPE_SCHEMA.optional().describe('产物类型。缺省时从扩展名推断。'),
        previewType: PREVIEW_TYPE_SCHEMA.optional().describe('UI 预览类型。缺省时从产物类型推断。'),
        sourceFiles: z.array(z.string()).default([]).describe('该产物基于哪些 Workspace 相对源文件生成。'),
        overwrite: z.boolean().default(false).describe('目标存在时是否覆盖。'),
        approvalId: z.string().optional().describe('已批准的审批 id。'),
      }),
      execute: async ({ name, path: inputPath, content, type, previewType, sourceFiles, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolveArtifactPath(rootPath, inputPath)
          const exists = fs.existsSync(target.absolutePath)
          if (exists && !overwrite) return { ok: false, error: '目标产物已存在，未覆盖。', path: target.relativePath, contextFiles: [target.relativePath] }

          const approval = requireApproval(context, {
            action: exists ? '覆盖生成产物' : '生成产物文件',
            toolName: 'generate_artifact',
            reason: '生成产物会在 Workspace 内写入文件，需要确认。',
            affectedPaths: [target.relativePath],
            approvalId,
          })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [target.relativePath, ...sourceFiles] }

          const checkpoint = createCheckpointIfNeeded(context, rootPath, target.relativePath)
          const beforeSize = exists ? fs.statSync(target.absolutePath).size : null
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.writeFileSync(target.absolutePath, content, 'utf-8')

          const artifactType = type ?? inferTypeFromPath(target.relativePath)
          const artifactPreviewType = previewType ?? inferPreviewType(artifactType)
          const size = Buffer.byteLength(content, 'utf-8')
          const normalizedSourceFiles = sourceFiles.map(normalizeRelative).filter(Boolean)
          const artifact = ArtifactStore.create({
            runId,
            workspaceId: context.workspaceId ?? null,
            name: name?.trim() || path.basename(target.relativePath),
            path: target.relativePath,
            type: artifactType,
            previewType: artifactPreviewType,
            sourceFiles: normalizedSourceFiles,
            size,
          })
          const change = FileChangeStore.create({
            runId,
            type: exists ? 'modified' : 'created',
            path: target.relativePath,
            diff: beforeSize == null ? `created ${size} bytes` : `${beforeSize} -> ${size} bytes`,
            reason: exists ? '覆盖生成产物' : '生成产物文件',
            checkpointId: checkpoint?.id ?? null,
          })

          return { ok: true, artifact, change, checkpoint, path: target.relativePath, contextFiles: [target.relativePath, ...normalizedSourceFiles] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}