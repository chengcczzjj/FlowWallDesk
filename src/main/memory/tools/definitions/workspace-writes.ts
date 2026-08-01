import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { ApprovalStore } from '../../agent/approvalStore'
import { CheckpointStore } from '../../agent/checkpointStore'
import { FileChangeStore } from '../../agent/fileChangeStore'
import { AGENT_TRASH_DIR } from '../../db/paths'
import { ProjectStore } from '../../projects/projectStore'
import { evaluateWorkspaceAccess, shouldAutoApproveWorkspaceTool, type WorkspaceOperation } from '../../security/permissionEngine'
import type { WorkspaceToolContext } from './workspace-files'

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法修改本地文件。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

function ensureRunContext(context: WorkspaceToolContext): { runId: string; threadId: string } {
  if (!context.runId || !context.threadId) throw new Error('当前运行缺少 AgentRun 上下文。')
  return { runId: context.runId, threadId: context.threadId }
}

function resolvePath(rootPath: string, inputPath: string, operation: WorkspaceOperation) {
  const permission = evaluateWorkspaceAccess({ rootPath, inputPath, operation })
  if (permission.decision === 'denied') throw new Error(permission.reason)
  if (!permission.resolvedPath) throw new Error(permission.reason)
  return { absolutePath: permission.resolvedPath, relativePath: permission.relativePath, permission }
}

function requireApproval(context: WorkspaceToolContext, params: {
  action: string
  toolName: string
  riskLevel?: 'medium' | 'high'
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
  if (shouldAutoApproveWorkspaceTool({ permissionProfile, toolName: params.toolName, riskLevel: params.riskLevel ?? 'medium', affectedPaths: params.affectedPaths })) {
    return null
  }
  return ApprovalStore.create({
    runId,
    threadId,
    workspaceId: context.workspaceId ?? null,
    action: params.action,
    toolName: params.toolName,
    riskLevel: params.riskLevel ?? 'medium',
    reason: params.reason,
    affectedPaths: params.affectedPaths,
    checkpointRequired: true,
    checkpointId: params.checkpointId ?? null,
  })
}

function createCheckpointIfNeeded(context: WorkspaceToolContext, rootPath: string, paths: string[], name: string) {
  const { runId } = ensureRunContext(context)
  const existingFiles = paths
    .map(normalizeRelative)
    .filter((item) => {
      const absolutePath = path.resolve(rootPath, item)
      return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
    })
  if (existingFiles.length === 0) return null
  return CheckpointStore.create({ workspaceId: context.workspaceId ?? null, runId, rootPath, name, paths: existingFiles })
}

function createApprovalResponse(approval: ReturnType<typeof ApprovalStore.create>, contextFiles: string[]) {
  return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles }
}

function sizeDiff(beforeSize: number | null, afterSize: number): string {
  return beforeSize == null ? `created ${afterSize} bytes` : `${beforeSize} -> ${afterSize} bytes`
}

export function createWorkspaceWriteTools(context: WorkspaceToolContext) {
  return {
    create_file: tool({
      description: '在当前 Workspace 内创建文本文件。若目标存在，需要 overwrite=true。写入前会审批并自动创建 checkpoint。',
      inputSchema: z.object({
        path: z.string().describe('Workspace 相对文件路径。'),
        content: z.string().describe('要写入的文本内容。'),
        overwrite: z.boolean().default(false).describe('目标存在时是否覆盖。'),
        approvalId: z.string().optional().describe('已批准的审批 id。'),
      }),
      execute: async ({ path: inputPath, content, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolvePath(rootPath, inputPath, 'write_file')
          const exists = fs.existsSync(target.absolutePath)
          if (exists && !overwrite) return { ok: false, error: '目标文件已存在，未覆盖。', path: target.relativePath, contextFiles: [target.relativePath] }
          const approval = requireApproval(context, { action: exists ? '覆盖文件' : '创建文件', toolName: 'create_file', reason: '创建或覆盖文件会修改 Workspace 内容，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before create_file ${target.relativePath}`)
          const beforeSize = exists ? fs.statSync(target.absolutePath).size : null
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.writeFileSync(target.absolutePath, content, 'utf-8')
          const change = FileChangeStore.create({ runId, type: exists ? 'modified' : 'created', path: target.relativePath, diff: sizeDiff(beforeSize, Buffer.byteLength(content)), reason: exists ? '覆盖写入文件' : '创建文件', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, path: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    write_file: tool({
      description: '覆盖写入当前 Workspace 内文本文件。写入前会审批并自动创建 checkpoint。',
      inputSchema: z.object({
        path: z.string().describe('Workspace 相对文件路径。'),
        content: z.string().describe('完整文件内容。'),
        approvalId: z.string().optional().describe('已批准的审批 id。'),
      }),
      execute: async ({ path: inputPath, content, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolvePath(rootPath, inputPath, 'write_file')
          const exists = fs.existsSync(target.absolutePath)
          const approval = requireApproval(context, { action: exists ? '覆盖文件' : '创建文件', toolName: 'write_file', reason: '写入文件会修改 Workspace 内容，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before write_file ${target.relativePath}`)
          const beforeSize = exists ? fs.statSync(target.absolutePath).size : null
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.writeFileSync(target.absolutePath, content, 'utf-8')
          const change = FileChangeStore.create({ runId, type: exists ? 'modified' : 'created', path: target.relativePath, diff: sizeDiff(beforeSize, Buffer.byteLength(content)), reason: exists ? '覆盖写入文件' : '创建文件', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, path: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    patch_file: tool({
      description: '对当前 Workspace 内文本文件执行简单字符串替换。写入前会审批并自动创建 checkpoint。',
      inputSchema: z.object({
        path: z.string().describe('Workspace 相对文件路径。'),
        search: z.string().min(1).describe('要查找的原文。'),
        replace: z.string().describe('替换后的文本。'),
        replaceAll: z.boolean().default(false).describe('是否替换全部匹配。'),
        approvalId: z.string().optional().describe('已批准的审批 id。'),
      }),
      execute: async ({ path: inputPath, search, replace, replaceAll, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolvePath(rootPath, inputPath, 'write_file')
          if (!fs.existsSync(target.absolutePath) || !fs.statSync(target.absolutePath).isFile()) return { ok: false, error: '目标文件不存在。', path: target.relativePath, contextFiles: [target.relativePath] }
          const before = fs.readFileSync(target.absolutePath, 'utf-8')
          if (!before.includes(search)) return { ok: false, error: '未找到要替换的文本。', path: target.relativePath, contextFiles: [target.relativePath] }
          const approval = requireApproval(context, { action: '修改文件内容', toolName: 'patch_file', reason: '修改文件内容需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before patch_file ${target.relativePath}`)
          const after = replaceAll ? before.split(search).join(replace) : before.replace(search, replace)
          fs.writeFileSync(target.absolutePath, after, 'utf-8')
          const change = FileChangeStore.create({ runId, type: 'modified', path: target.relativePath, diff: sizeDiff(Buffer.byteLength(before), Buffer.byteLength(after)), reason: '替换文件文本', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, path: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    create_directory: tool({
      description: '在当前 Workspace 内创建目录。需要审批。',
      inputSchema: z.object({ path: z.string().describe('Workspace 相对目录路径。'), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolvePath(rootPath, inputPath, 'create_directory')
          const approval = requireApproval(context, { action: '创建目录', toolName: 'create_directory', reason: '创建目录会修改 Workspace 文件结构，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          fs.mkdirSync(target.absolutePath, { recursive: true })
          const change = FileChangeStore.create({ runId, type: 'created', path: target.relativePath, reason: '创建目录' })
          return { ok: true, change, path: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    copy_path: tool({
      description: '复制当前 Workspace 内文件到另一个 Workspace 相对路径。需要审批，目标存在时需要 overwrite=true。',
      inputSchema: z.object({ sourcePath: z.string(), targetPath: z.string(), overwrite: z.boolean().default(false), approvalId: z.string().optional() }),
      execute: async ({ sourcePath, targetPath, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const source = resolvePath(rootPath, sourcePath, 'get_file_info')
          const target = resolvePath(rootPath, targetPath, 'copy_path')
          if (!fs.statSync(source.absolutePath).isFile()) return { ok: false, error: '当前只支持复制文件。', contextFiles: [source.relativePath] }
          if (fs.existsSync(target.absolutePath) && !overwrite) return { ok: false, error: '目标已存在，未覆盖。', contextFiles: [source.relativePath, target.relativePath] }
          const approval = requireApproval(context, { action: '复制文件', toolName: 'copy_path', reason: '复制文件会修改 Workspace 文件结构，需要确认。', affectedPaths: [source.relativePath, target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [source.relativePath, target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before copy_path ${target.relativePath}`)
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.copyFileSync(source.absolutePath, target.absolutePath)
          const change = FileChangeStore.create({ runId, type: 'copied', path: target.relativePath, oldPath: source.relativePath, reason: '复制文件', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, sourcePath: source.relativePath, targetPath: target.relativePath, contextFiles: [source.relativePath, target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    move_path: tool({
      description: '移动或重命名当前 Workspace 内文件。需要审批并自动创建 checkpoint。',
      inputSchema: z.object({ sourcePath: z.string(), targetPath: z.string(), overwrite: z.boolean().default(false), approvalId: z.string().optional() }),
      execute: async ({ sourcePath, targetPath, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const source = resolvePath(rootPath, sourcePath, 'move_path')
          const target = resolvePath(rootPath, targetPath, 'move_path')
          if (!fs.statSync(source.absolutePath).isFile()) return { ok: false, error: '当前只支持移动文件。', contextFiles: [source.relativePath] }
          if (fs.existsSync(target.absolutePath) && !overwrite) return { ok: false, error: '目标已存在，未覆盖。', contextFiles: [source.relativePath, target.relativePath] }
          const approval = requireApproval(context, { action: '移动文件', toolName: 'move_path', reason: '移动文件会修改 Workspace 文件结构，需要确认。', affectedPaths: [source.relativePath, target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [source.relativePath, target.relativePath])
          const checkpointPaths = fs.existsSync(target.absolutePath) ? [source.relativePath, target.relativePath] : [source.relativePath]
          const checkpoint = createCheckpointIfNeeded(context, rootPath, checkpointPaths, `Before move_path ${source.relativePath}`)
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.renameSync(source.absolutePath, target.absolutePath)
          const change = FileChangeStore.create({ runId, type: 'moved', path: target.relativePath, oldPath: source.relativePath, reason: '移动文件', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, sourcePath: source.relativePath, targetPath: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    delete_to_trash: tool({
      description: '把 Workspace 内文件移动到应用内回收区。不会永久删除。需要审批并自动创建 checkpoint。',
      inputSchema: z.object({ path: z.string(), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const target = resolvePath(rootPath, inputPath, 'delete_path')
          if (!fs.statSync(target.absolutePath).isFile()) return { ok: false, error: '当前只支持删除文件到回收区。', contextFiles: [target.relativePath] }
          const approval = requireApproval(context, { action: '删除到应用回收区', toolName: 'delete_to_trash', riskLevel: 'high', reason: '删除文件会移动文件到应用回收区，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before delete_to_trash ${target.relativePath}`)
          const trashPath = path.join(AGENT_TRASH_DIR, runId, target.relativePath)
          fs.mkdirSync(path.dirname(trashPath), { recursive: true })
          fs.renameSync(target.absolutePath, trashPath)
          const change = FileChangeStore.create({ runId, type: 'deleted-to-trash', path: target.relativePath, backupPath: trashPath, reason: '删除到应用回收区', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, trashPath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    restore_from_trash: tool({
      description: '从应用内回收区恢复文件到 Workspace。需要审批。',
      inputSchema: z.object({ trashPath: z.string(), targetPath: z.string(), approvalId: z.string().optional() }),
      execute: async ({ trashPath, targetPath, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const { runId } = ensureRunContext(context)
          const trashRoot = path.resolve(AGENT_TRASH_DIR)
          const requestedSource = path.resolve(trashPath)
          if (!fs.existsSync(requestedSource)) return { ok: false, error: '回收区文件不存在或路径非法。', contextFiles: [] }
          const source = fs.realpathSync.native(requestedSource)
          const relativeSource = path.relative(fs.realpathSync.native(trashRoot), source)
          if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
            return { ok: false, error: '回收区文件不存在或路径非法。', contextFiles: [] }
          }
          const target = resolvePath(rootPath, targetPath, 'write_file')
          const approval = requireApproval(context, { action: '从应用回收区恢复文件', toolName: 'restore_from_trash', reason: '恢复文件会写入 Workspace，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return createApprovalResponse(approval, [target.relativePath])
          const checkpoint = createCheckpointIfNeeded(context, rootPath, [target.relativePath], `Before restore_from_trash ${target.relativePath}`)
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.copyFileSync(source, target.absolutePath)
          fs.unlinkSync(source)
          const change = FileChangeStore.create({ runId, type: 'restored', path: target.relativePath, backupPath: source, reason: '从应用回收区恢复文件', checkpointId: checkpoint?.id ?? null })
          return { ok: true, change, checkpoint, path: target.relativePath, contextFiles: [target.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}
