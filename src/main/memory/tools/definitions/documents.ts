import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { ApprovalStore } from '../../agent/approvalStore'
import { ArtifactStore } from '../../agent/artifactStore'
import { CheckpointStore } from '../../agent/checkpointStore'
import { FileChangeStore } from '../../agent/fileChangeStore'
import { ProjectStore } from '../../projects/projectStore'
import { evaluateWorkspaceAccess, shouldAutoApproveWorkspaceTool, type WorkspaceOperation } from '../../security/permissionEngine'
import type { WorkspaceToolContext } from './workspace-files'

const MAX_TEXT_CHARS = 80_000
const MAX_SHEET_ROWS = 200
const MAX_SHEET_COLS = 50

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function getWorkspaceRoot(context: WorkspaceToolContext): string {
  if (!context.workspaceId) throw new Error('当前对话没有选择工作文件夹，无法处理文档。')
  const workspace = ProjectStore.get(context.workspaceId)
  const root = workspace?.rootPath ?? workspace?.path
  if (!root) throw new Error('当前 Workspace 没有可用路径。')
  return root
}

function ensureRunContext(context: WorkspaceToolContext): { runId: string; threadId: string } {
  if (!context.runId || !context.threadId) throw new Error('当前运行缺少 AgentRun 上下文。')
  return { runId: context.runId, threadId: context.threadId }
}

function resolveWorkspacePath(rootPath: string, inputPath: string, operation: WorkspaceOperation) {
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
  })
}

function requireReadAccess(context: WorkspaceToolContext, permission: ReturnType<typeof evaluateWorkspaceAccess>, params: { action: string; toolName: string; approvalId?: string }) {
  if (permission.decision !== 'needsApproval') return null
  const { runId, threadId } = ensureRunContext(context)
  if (ApprovalStore.hasApprovedAccess({ approvalId: params.approvalId, workspaceId: context.workspaceId, toolName: params.toolName, action: params.action, affectedPaths: [permission.relativePath] })) {
    return null
  }
  return ApprovalStore.create({
    runId,
    threadId,
    workspaceId: context.workspaceId ?? null,
    action: params.action,
    toolName: params.toolName,
    riskLevel: permission.riskLevel,
    reason: permission.reason,
    affectedPaths: [permission.relativePath],
    checkpointRequired: false,
  })
}

function createCheckpointIfNeeded(context: WorkspaceToolContext, rootPath: string, relativePath: string) {
  const { runId } = ensureRunContext(context)
  const absolutePath = path.resolve(rootPath, relativePath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null
  return CheckpointStore.create({ workspaceId: context.workspaceId ?? null, runId, rootPath, name: `Before document write ${relativePath}`, paths: [relativePath] })
}

function recordGeneratedFile(context: WorkspaceToolContext, data: { rootPath: string; relativePath: string; name: string; type: 'document' | 'spreadsheet'; sourceFiles: string[]; beforeSize: number | null; size: number; checkpointId?: string | null }) {
  const { runId } = ensureRunContext(context)
  const artifact = ArtifactStore.create({
    runId,
    workspaceId: context.workspaceId ?? null,
    name: data.name,
    path: data.relativePath,
    type: data.type,
    previewType: 'none',
    sourceFiles: data.sourceFiles.map(normalizeRelative),
    size: data.size,
  })
  const change = FileChangeStore.create({
    runId,
    type: data.beforeSize == null ? 'created' : 'modified',
    path: data.relativePath,
    diff: data.beforeSize == null ? `created ${data.size} bytes` : `${data.beforeSize} -> ${data.size} bytes`,
    reason: data.type === 'document' ? '生成 DOCX 文档' : '生成 XLSX 表格',
    checkpointId: data.checkpointId ?? null,
  })
  return { artifact, change }
}

function normalizeCellValue(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const maybeRichText = value as { richText?: { text?: string }[]; text?: string; result?: unknown; hyperlink?: string }
    if (maybeRichText.result !== undefined) return normalizeCellValue(maybeRichText.result)
    if (Array.isArray(maybeRichText.richText)) return maybeRichText.richText.map((item) => item.text ?? '').join('')
    if (typeof maybeRichText.text === 'string') return maybeRichText.text
    if (typeof maybeRichText.hyperlink === 'string') return maybeRichText.hyperlink
  }
  return String(value)
}

export function createDocumentTools(context: WorkspaceToolContext) {
  return {
    extract_pdf_text: tool({
      description: '提取当前 Workspace 内 PDF 文件的文本内容。',
      inputSchema: z.object({ path: z.string(), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const resolved = resolveWorkspacePath(rootPath, inputPath, 'read_file')
          const approval = requireReadAccess(context, resolved.permission, { action: '读取 PDF 内容', toolName: 'extract_pdf_text', approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [resolved.relativePath] }
          const { PDFParse } = await import('pdf-parse')
          const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(resolved.absolutePath)) })
          const result = await parser.getText()
          await parser.destroy()
          const text = result.text.slice(0, MAX_TEXT_CHARS)
          return { ok: true, path: resolved.relativePath, pages: result.total, truncated: result.text.length > text.length, text, contextFiles: [resolved.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    read_docx: tool({
      description: '读取当前 Workspace 内 DOCX 文档的纯文本内容。',
      inputSchema: z.object({ path: z.string(), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const resolved = resolveWorkspacePath(rootPath, inputPath, 'read_file')
          const approval = requireReadAccess(context, resolved.permission, { action: '读取 DOCX 内容', toolName: 'read_docx', approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [resolved.relativePath] }
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ buffer: fs.readFileSync(resolved.absolutePath) })
          const text = result.value.slice(0, MAX_TEXT_CHARS)
          const messages = result.messages.map((item) => ({ type: String(item.type), message: String(item.message) }))
          return { ok: true, path: resolved.relativePath, truncated: result.value.length > text.length, text, messages, contextFiles: [resolved.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    read_xlsx: tool({
      description: '读取当前 Workspace 内 XLSX 表格，返回工作表名和前若干行二维数组。',
      inputSchema: z.object({ path: z.string(), sheetName: z.string().optional(), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, sheetName, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const resolved = resolveWorkspacePath(rootPath, inputPath, 'read_file')
          const approval = requireReadAccess(context, resolved.permission, { action: '读取 XLSX 内容', toolName: 'read_xlsx', approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [resolved.relativePath] }
          const ExcelJS = await import('exceljs')
          const workbook = new ExcelJS.Workbook()
          const fileBuffer = fs.readFileSync(resolved.absolutePath)
          const xlsxBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as unknown as Parameters<typeof workbook.xlsx.load>[0]
          await workbook.xlsx.load(xlsxBuffer)
          const sheetNames = workbook.worksheets.map((sheet) => sheet.name)
          const selectedSheets = sheetName ? [workbook.getWorksheet(sheetName)] : workbook.worksheets.slice(0, 5)
          const sheets = selectedSheets.map((worksheet) => {
            if (!worksheet) return { name: sheetName ?? '', rows: [], missing: true }
            const rows: (string | number | boolean | null)[][] = []
            worksheet.eachRow({ includeEmpty: false }, (row) => {
              if (rows.length >= MAX_SHEET_ROWS) return
              const values = Array.isArray(row.values) ? row.values.slice(1, MAX_SHEET_COLS + 1) : []
              rows.push(values.map(normalizeCellValue))
            })
            return { name: worksheet.name, rows, truncated: worksheet.rowCount > MAX_SHEET_ROWS }
          })
          return { ok: true, path: resolved.relativePath, sheetNames, sheets, contextFiles: [resolved.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    write_docx: tool({
      description: '在当前 Workspace 内生成 DOCX 文档 Artifact。输入标题和段落数组。需要审批。',
      inputSchema: z.object({
        path: z.string(),
        title: z.string().optional(),
        paragraphs: z.array(z.string()).min(1),
        sourceFiles: z.array(z.string()).default([]),
        overwrite: z.boolean().default(false),
        approvalId: z.string().optional(),
      }),
      execute: async ({ path: inputPath, title, paragraphs, sourceFiles, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const target = resolveWorkspacePath(rootPath, inputPath, 'write_file')
          const exists = fs.existsSync(target.absolutePath)
          if (exists && !overwrite) return { ok: false, error: '目标 DOCX 已存在，未覆盖。', contextFiles: [target.relativePath] }
          const approval = requireApproval(context, { action: exists ? '覆盖 DOCX 文档' : '生成 DOCX 文档', toolName: 'write_docx', reason: '生成 DOCX 会写入 Workspace 文件，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [target.relativePath, ...sourceFiles] }
          const checkpoint = createCheckpointIfNeeded(context, rootPath, target.relativePath)
          const beforeSize = exists ? fs.statSync(target.absolutePath).size : null
          const docx = await import('docx')
          const document = new docx.Document({
            sections: [{
              properties: {},
              children: [
                ...(title ? [new docx.Paragraph({ text: title, heading: docx.HeadingLevel.TITLE })] : []),
                ...paragraphs.map((item) => new docx.Paragraph({ children: [new docx.TextRun(item)] })),
              ],
            }],
          })
          const buffer = await docx.Packer.toBuffer(document)
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.writeFileSync(target.absolutePath, buffer)
          const result = recordGeneratedFile(context, { rootPath, relativePath: target.relativePath, name: title || path.basename(target.relativePath), type: 'document', sourceFiles, beforeSize, size: buffer.length, checkpointId: checkpoint?.id ?? null })
          return { ok: true, ...result, checkpoint, path: target.relativePath, contextFiles: [target.relativePath, ...sourceFiles.map(normalizeRelative)] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    write_xlsx: tool({
      description: '在当前 Workspace 内生成 XLSX 表格 Artifact。输入多个工作表和二维数组。需要审批。',
      inputSchema: z.object({
        path: z.string(),
        sheets: z.array(z.object({ name: z.string(), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))) })).min(1),
        sourceFiles: z.array(z.string()).default([]),
        overwrite: z.boolean().default(false),
        approvalId: z.string().optional(),
      }),
      execute: async ({ path: inputPath, sheets, sourceFiles, overwrite, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const target = resolveWorkspacePath(rootPath, inputPath, 'write_file')
          const exists = fs.existsSync(target.absolutePath)
          if (exists && !overwrite) return { ok: false, error: '目标 XLSX 已存在，未覆盖。', contextFiles: [target.relativePath] }
          const approval = requireApproval(context, { action: exists ? '覆盖 XLSX 表格' : '生成 XLSX 表格', toolName: 'write_xlsx', reason: '生成 XLSX 会写入 Workspace 文件，需要确认。', affectedPaths: [target.relativePath], approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [target.relativePath, ...sourceFiles] }
          const checkpoint = createCheckpointIfNeeded(context, rootPath, target.relativePath)
          const beforeSize = exists ? fs.statSync(target.absolutePath).size : null
          const ExcelJS = await import('exceljs')
          const workbook = new ExcelJS.Workbook()
          sheets.forEach((sheet, index) => {
            const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31) || `Sheet${index + 1}`)
            sheet.rows.forEach((row) => worksheet.addRow(row))
          })
          const output = await workbook.xlsx.writeBuffer()
          const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output)
          fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true })
          fs.writeFileSync(target.absolutePath, buffer)
          const result = recordGeneratedFile(context, { rootPath, relativePath: target.relativePath, name: path.basename(target.relativePath), type: 'spreadsheet', sourceFiles, beforeSize, size: buffer.length, checkpointId: checkpoint?.id ?? null })
          return { ok: true, ...result, checkpoint, path: target.relativePath, contextFiles: [target.relativePath, ...sourceFiles.map(normalizeRelative)] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),

    ocr_image: tool({
      description: '对当前 Workspace 内图片执行 OCR 文字识别。',
      inputSchema: z.object({ path: z.string(), language: z.string().default('eng+chi_sim'), approvalId: z.string().optional() }),
      execute: async ({ path: inputPath, language, approvalId }) => {
        try {
          const rootPath = getWorkspaceRoot(context)
          const resolved = resolveWorkspacePath(rootPath, inputPath, 'read_file')
          const approval = requireReadAccess(context, resolved.permission, { action: 'OCR 识别图片内容', toolName: 'ocr_image', approvalId })
          if (approval) return { ok: false, approvalRequired: true, approvalId: approval.id, approval, error: approval.reason, contextFiles: [resolved.relativePath] }
          const tesseract = await import('tesseract.js')
          const result = await tesseract.recognize(resolved.absolutePath, language)
          return { ok: true, path: resolved.relativePath, language, confidence: result.data.confidence, text: result.data.text.slice(0, MAX_TEXT_CHARS), contextFiles: [resolved.relativePath] }
        } catch (error) {
          return { ok: false, error: (error as Error).message, contextFiles: [] }
        }
      },
    }),
  }
}