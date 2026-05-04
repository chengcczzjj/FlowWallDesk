import fs from 'node:fs'
import path from 'node:path'
import type { WorkspacePermissionProfile } from '@shared/types'

export type PermissionDecision = 'allowed' | 'needsApproval' | 'denied'
export type PermissionRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type WorkspaceOperation =
  | 'list_directory'
  | 'read_file'
  | 'search_text'
  | 'get_file_info'
  | 'create_directory'
  | 'copy_path'
  | 'write_file'
  | 'delete_path'
  | 'move_path'
  | 'run_command'

export interface WorkspacePermissionResult {
  decision: PermissionDecision
  riskLevel: PermissionRiskLevel
  reason: string
  operation: WorkspaceOperation
  rootPath: string
  requestedPath: string
  normalizedPath: string
  resolvedPath: string | null
  relativePath: string
  exists: boolean
  isOutsideWorkspace: boolean
  isSymlinkEscape: boolean
  isSensitive: boolean
}

const SENSITIVE_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.pem',
  '.key',
  'id_rsa',
  'id_ed25519',
])

const WORKSPACE_WRITE_AUTO_APPROVED_TOOLS = new Set([
  'create_file',
  'write_file',
  'patch_file',
  'create_directory',
  'copy_path',
  'move_path',
  'restore_from_trash',
  'generate_artifact',
  'write_docx',
  'write_xlsx',
])

const FULL_ACCESS_EXTRA_AUTO_APPROVED_TOOLS = new Set([
  'delete_to_trash',
])

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function isSensitiveRelativePath(relativePath: string): boolean {
  const normalized = normalizeRelative(relativePath).toLowerCase()
  const fileName = path.basename(normalized)
  if (SENSITIVE_FILE_NAMES.has(fileName)) return true
  if (normalized.includes('/.ssh/')) return true
  if (/(secret|token|credential|password|passwd|apikey|api-key)/i.test(normalized)) return true
  return false
}

export function shouldAutoApproveWorkspaceTool(params: {
  permissionProfile?: WorkspacePermissionProfile | null
  toolName: string
  riskLevel?: PermissionRiskLevel
  affectedPaths?: string[]
}): boolean {
  const profile = params.permissionProfile
  if (!profile || profile === 'read-only' || profile === 'ask-before-editing') return false
  if (params.toolName === 'run_command') return false
  if (params.affectedPaths?.some(isSensitiveRelativePath)) return false

  if (profile === 'workspace-write') {
    return params.riskLevel !== 'high' && WORKSPACE_WRITE_AUTO_APPROVED_TOOLS.has(params.toolName)
  }

  if (profile === 'full-access') {
    return WORKSPACE_WRITE_AUTO_APPROVED_TOOLS.has(params.toolName) || FULL_ACCESS_EXTRA_AUTO_APPROVED_TOOLS.has(params.toolName)
  }

  return false
}

function classifyAllowedOperation(operation: WorkspaceOperation, isSensitive: boolean): Pick<WorkspacePermissionResult, 'decision' | 'riskLevel' | 'reason'> {
  if (operation === 'read_file' && isSensitive) {
    return {
      decision: 'needsApproval',
      riskLevel: 'high',
      reason: '该文件可能包含密钥、凭据或令牌，当前版本不会在没有审批的情况下读取其内容。',
    }
  }

  if (operation === 'search_text' && isSensitive) {
    return {
      decision: 'needsApproval',
      riskLevel: 'high',
      reason: '该搜索目标可能包含敏感内容，已阻止直接检索。',
    }
  }

  if (operation === 'write_file' || operation === 'delete_path' || operation === 'move_path' || operation === 'run_command' || operation === 'create_directory' || operation === 'copy_path') {
    return {
      decision: 'needsApproval',
      riskLevel: operation === 'run_command' || operation === 'delete_path' ? 'high' : 'medium',
      reason: '该操作会修改文件、删除文件或执行命令，需要用户审批。',
    }
  }

  return {
    decision: 'allowed',
    riskLevel: isSensitive ? 'medium' : 'low',
    reason: isSensitive ? '仅允许查看敏感路径的元信息，不读取内容。' : '路径位于当前工作文件夹内，允许执行只读操作。',
  }
}

export function evaluateWorkspaceAccess(params: {
  rootPath: string
  inputPath?: string
  operation: WorkspaceOperation
}): WorkspacePermissionResult {
  const rootRealPath = fs.realpathSync.native(params.rootPath)
  const requestedPath = params.inputPath?.trim() || '.'
  const normalizedPath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(rootRealPath, requestedPath)
  const lexicalRelativePath = normalizeRelative(path.relative(rootRealPath, normalizedPath))
  const exists = fs.existsSync(normalizedPath)

  if (!exists) {
    const isOutsideWorkspace = !isInside(rootRealPath, normalizedPath)
    const isSensitive = isSensitiveRelativePath(lexicalRelativePath)
    if (!isOutsideWorkspace && (params.operation === 'write_file' || params.operation === 'create_directory' || params.operation === 'copy_path' || params.operation === 'move_path')) {
      const decision = classifyAllowedOperation(params.operation, isSensitive)
      return {
        ...decision,
        operation: params.operation,
        rootPath: rootRealPath,
        requestedPath,
        normalizedPath,
        resolvedPath: normalizedPath,
        relativePath: lexicalRelativePath,
        exists: false,
        isOutsideWorkspace: false,
        isSymlinkEscape: false,
        isSensitive,
      }
    }

    return {
      decision: 'denied',
      riskLevel: 'low',
      reason: `路径不存在: ${lexicalRelativePath}`,
      operation: params.operation,
      rootPath: rootRealPath,
      requestedPath,
      normalizedPath,
      resolvedPath: null,
      relativePath: lexicalRelativePath,
      exists: false,
      isOutsideWorkspace,
      isSymlinkEscape: false,
      isSensitive,
    }
  }

  const resolvedPath = fs.realpathSync.native(normalizedPath)
  const lexicalInside = isInside(rootRealPath, normalizedPath)
  const realInside = isInside(rootRealPath, resolvedPath)
  const relativePath = normalizeRelative(path.relative(rootRealPath, resolvedPath))
  const isSymlinkEscape = lexicalInside && !realInside
  const isOutsideWorkspace = !realInside
  const isSensitive = isSensitiveRelativePath(relativePath)

  if (isOutsideWorkspace) {
    return {
      decision: 'denied',
      riskLevel: 'critical',
      reason: isSymlinkEscape ? '路径通过符号链接跳出了当前工作文件夹，已阻止访问。' : '路径位于当前工作文件夹之外，已阻止访问。',
      operation: params.operation,
      rootPath: rootRealPath,
      requestedPath,
      normalizedPath,
      resolvedPath,
      relativePath,
      exists,
      isOutsideWorkspace,
      isSymlinkEscape,
      isSensitive,
    }
  }

  const decision = classifyAllowedOperation(params.operation, isSensitive)

  return {
    ...decision,
    operation: params.operation,
    rootPath: rootRealPath,
    requestedPath,
    normalizedPath,
    resolvedPath,
    relativePath,
    exists,
    isOutsideWorkspace,
    isSymlinkEscape,
    isSensitive,
  }
}