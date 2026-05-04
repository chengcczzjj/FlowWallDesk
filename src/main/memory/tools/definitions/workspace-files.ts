import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { ProjectStore } from '../../projects/projectStore'
import { ApprovalStore } from '../../agent/approvalStore'
import { evaluateWorkspaceAccess, type WorkspaceOperation, type WorkspacePermissionResult } from '../../security/permissionEngine'

const MAX_LIST_ENTRIES = 200
const MAX_READ_BYTES = 200_000
const MAX_SEARCH_FILES = 1000
const MAX_SEARCH_RESULTS = 80
const MAX_SEARCH_FILE_BYTES = 1_000_000
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'out'])

export interface WorkspaceToolContext {
  workspaceId?: string | null
  runId?: string
  threadId?: string
}

interface ResolvedWorkspacePath {
  rootPath: string
  absolutePath: string
  relativePath: string
  permission: WorkspacePermissionResult
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function getWorkspaceRoot(context: WorkspaceToolContext): string | null {
  if (!context.workspaceId) return null
  const workspace = ProjectStore.get(context.workspaceId)
  return workspace?.rootPath ?? workspace?.path ?? null
}

function resolveWorkspacePath(context: WorkspaceToolContext, inputPath: string | undefined, operation: WorkspaceOperation): ResolvedWorkspacePath {
  const root = getWorkspaceRoot(context)
  if (!root) throw new Error('当前对话没有选择工作文件夹，无法读取本地项目文件。')
  const permission = evaluateWorkspaceAccess({ rootPath: root, inputPath, operation })
  if (permission.decision === 'denied') throw new Error(permission.reason)
  if (!permission.resolvedPath) throw new Error(permission.reason)

  return {
    rootPath: permission.rootPath,
    absolutePath: permission.resolvedPath,
    relativePath: permission.relativePath,
    permission,
  }
}

function createApprovalForPermission(context: WorkspaceToolContext, permission: WorkspacePermissionResult, params: { action: string; toolName: string }) {
  if (!context.runId || !context.threadId) return null
  return ApprovalStore.create({
    runId: context.runId,
    threadId: context.threadId,
    workspaceId: context.workspaceId ?? null,
    action: params.action,
    toolName: params.toolName,
    riskLevel: permission.riskLevel,
    reason: permission.reason,
    affectedPaths: [permission.relativePath],
    checkpointRequired: false,
  })
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 4096)
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) return true
  }
  return false
}

function formatEntry(rootPath: string, absolutePath: string, entry: fs.Dirent) {
  const itemPath = path.join(absolutePath, entry.name)
  const stats = fs.statSync(itemPath)
  return {
    name: entry.name,
    path: normalizeRelative(path.relative(rootPath, itemPath)),
    type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
    size: entry.isFile() ? stats.size : null,
    modifiedAt: stats.mtimeMs,
  }
}

function collectSearchFiles(rootPath: string, startPath: string): string[] {
  const files: string[] = []
  const pending = [startPath]

  while (pending.length > 0 && files.length < MAX_SEARCH_FILES) {
    const current = pending.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const permission = evaluateWorkspaceAccess({ rootPath, inputPath: absolutePath, operation: 'search_text' })
      if (permission.decision !== 'allowed' || !permission.resolvedPath) continue
      files.push(permission.resolvedPath)
      if (files.length >= MAX_SEARCH_FILES) break
    }
  }

  return files
}

export function createWorkspaceFileTools(context: WorkspaceToolContext) {
  return {
    list_directory: tool({
      description: '列出当前工作文件夹内某个目录的直接子项。只能访问用户选择的 Workspace 内路径。',
      inputSchema: z.object({
        path: z.string().default('.').describe('Workspace 相对路径，例如 "."、"src"、"doc"。'),
        limit: z.number().min(1).max(MAX_LIST_ENTRIES).default(100).describe('最多返回多少项。'),
      }),
      execute: async ({ path: inputPath, limit }) => {
        try {
          const resolved = resolveWorkspacePath(context, inputPath, 'list_directory')
          const stats = fs.statSync(resolved.absolutePath)
          if (!stats.isDirectory()) {
            return { ok: false, error: '目标不是目录', path: resolved.relativePath, permission: resolved.permission, contextFiles: [resolved.relativePath] }
          }

          const allEntryNames = fs.readdirSync(resolved.absolutePath)
          const entries = fs.readdirSync(resolved.absolutePath, { withFileTypes: true })
            .sort((left, right) => {
              if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
              return left.name.localeCompare(right.name, 'zh-CN')
            })
            .slice(0, limit)
            .map((entry) => formatEntry(resolved.rootPath, resolved.absolutePath, entry))

          return {
            ok: true,
            path: resolved.relativePath,
            permission: resolved.permission,
            totalEntries: allEntryNames.length,
            entries,
            contextFiles: [resolved.relativePath],
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    read_file: tool({
      description: '读取当前工作文件夹内的文本文件内容。只能读取 Workspace 内路径，大文件会自动截断。',
      inputSchema: z.object({
        path: z.string().describe('Workspace 相对文件路径，例如 "README.md"、"src/main.ts"。'),
      }),
      execute: async ({ path: inputPath }) => {
        try {
          const resolved = resolveWorkspacePath(context, inputPath, 'read_file')
          if (resolved.permission.decision === 'needsApproval') {
            const approval = createApprovalForPermission(context, resolved.permission, { action: '读取敏感文件内容', toolName: 'read_file' })
            return { ok: false, approvalRequired: true, approvalId: approval?.id, approval, error: resolved.permission.reason, path: resolved.relativePath, permission: resolved.permission, contextFiles: [resolved.relativePath] }
          }
          const stats = fs.statSync(resolved.absolutePath)
          if (!stats.isFile()) return { ok: false, error: '目标不是文件', path: resolved.relativePath, permission: resolved.permission, contextFiles: [resolved.relativePath] }

          const bytesToRead = Math.min(stats.size, MAX_READ_BYTES)
          const file = fs.openSync(resolved.absolutePath, 'r')
          const buffer = Buffer.alloc(bytesToRead)
          fs.readSync(file, buffer, 0, bytesToRead, 0)
          fs.closeSync(file)

          if (isProbablyBinary(buffer)) {
            return { ok: false, error: '目标像是二进制文件，未读取内容', path: resolved.relativePath, size: stats.size, permission: resolved.permission, contextFiles: [resolved.relativePath] }
          }

          return {
            ok: true,
            path: resolved.relativePath,
            permission: resolved.permission,
            size: stats.size,
            truncated: stats.size > MAX_READ_BYTES,
            content: buffer.toString('utf-8'),
            contextFiles: [resolved.relativePath],
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    search_text: tool({
      description: '在当前工作文件夹内搜索文本。适合先定位相关文件，再用 read_file 读取。会跳过常见依赖/构建目录。',
      inputSchema: z.object({
        query: z.string().min(1).describe('要搜索的文本关键词。'),
        path: z.string().default('.').describe('搜索起点的 Workspace 相对路径。'),
        caseSensitive: z.boolean().default(false).describe('是否区分大小写。'),
        maxResults: z.number().min(1).max(MAX_SEARCH_RESULTS).default(30).describe('最多返回多少条匹配。'),
      }),
      execute: async ({ query, path: inputPath, caseSensitive, maxResults }) => {
        try {
          const resolved = resolveWorkspacePath(context, inputPath, 'search_text')
          if (resolved.permission.decision === 'needsApproval') {
            const approval = createApprovalForPermission(context, resolved.permission, { action: '搜索敏感文件内容', toolName: 'search_text' })
            return { ok: false, approvalRequired: true, approvalId: approval?.id, approval, query, error: resolved.permission.reason, path: resolved.relativePath, permission: resolved.permission, contextFiles: [resolved.relativePath] }
          }
          const startStats = fs.statSync(resolved.absolutePath)
          const files = startStats.isFile()
            ? [resolved.absolutePath]
            : collectSearchFiles(resolved.rootPath, resolved.absolutePath)

          const needle = caseSensitive ? query : query.toLowerCase()
          const matches: { path: string; line: number; preview: string }[] = []
          const contextFiles = new Set<string>()

          for (const filePath of files) {
            if (matches.length >= maxResults) break
            let stats: fs.Stats
            try {
              stats = fs.statSync(filePath)
            } catch {
              continue
            }
            if (stats.size > MAX_SEARCH_FILE_BYTES) continue

            const buffer = fs.readFileSync(filePath)
            if (isProbablyBinary(buffer)) continue

            const text = buffer.toString('utf-8')
            const lines = text.split(/\r?\n/)
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
              const line = lines[lineIndex]
              const haystack = caseSensitive ? line : line.toLowerCase()
              if (!haystack.includes(needle)) continue

              const relativePath = normalizeRelative(path.relative(resolved.rootPath, filePath))
              contextFiles.add(relativePath)
              matches.push({ path: relativePath, line: lineIndex + 1, preview: line.trim().slice(0, 240) })
              if (matches.length >= maxResults) break
            }
          }

          return {
            ok: true,
            query,
            permission: resolved.permission,
            searchedFiles: files.length,
            matches,
            contextFiles: [...contextFiles],
          }
        } catch (error) {
          return { ok: false, query, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    get_file_info: tool({
      description: '获取当前工作文件夹内文件或目录的基础信息，例如大小、修改时间、类型。',
      inputSchema: z.object({
        path: z.string().describe('Workspace 相对路径。'),
      }),
      execute: async ({ path: inputPath }) => {
        try {
          const resolved = resolveWorkspacePath(context, inputPath, 'get_file_info')
          const stats = fs.statSync(resolved.absolutePath)
          const children = stats.isDirectory() ? fs.readdirSync(resolved.absolutePath).length : null

          return {
            ok: true,
            path: resolved.relativePath,
            permission: resolved.permission,
            type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
            size: stats.size,
            extension: stats.isFile() ? path.extname(resolved.absolutePath).toLowerCase() : null,
            modifiedAt: stats.mtimeMs,
            createdAt: stats.birthtimeMs,
            children,
            contextFiles: [resolved.relativePath],
          }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}