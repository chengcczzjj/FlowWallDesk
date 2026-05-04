import fs from 'node:fs'
import path from 'node:path'
import { ArtifactStore } from './artifactStore'
import { evaluateWorkspaceAccess } from '../security/permissionEngine'
import type { AgentRunVerification } from '@shared/types'

export type VerificationCheckType = 'file_exists' | 'directory_exists' | 'contains_text' | 'not_contains_text'

export interface VerificationCheckInput {
  type: VerificationCheckType
  path: string
  text?: string
  name?: string
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/') || '.'
}

function count(items: AgentRunVerification['items'], status: AgentRunVerification['items'][number]['status']): number {
  return items.filter((item) => item.status === status).length
}

function createResult(items: AgentRunVerification['items']): AgentRunVerification {
  return {
    passed: count(items, 'passed'),
    failed: count(items, 'failed'),
    warnings: count(items, 'warning'),
    unchecked: count(items, 'unchecked'),
    items,
  }
}

export const VerificationEngine = {
  verifyWorkspace(rootPath: string, checks: VerificationCheckInput[], artifactIds: string[] = []): AgentRunVerification {
    const items: AgentRunVerification['items'] = []

    for (const check of checks) {
      const label = check.name?.trim() || `${check.type}: ${normalizeRelative(check.path)}`
      try {
        const operation = check.type === 'contains_text' || check.type === 'not_contains_text' ? 'read_file' : 'get_file_info'
        const permission = evaluateWorkspaceAccess({ rootPath, inputPath: check.path, operation })
        if (permission.decision === 'denied') {
          items.push({ name: label, status: 'failed', message: permission.reason })
          continue
        }
        if (permission.decision === 'needsApproval') {
          items.push({ name: label, status: 'warning', message: `验证需要审批: ${permission.reason}` })
          continue
        }
        if (!permission.resolvedPath) {
          items.push({ name: label, status: 'failed', message: permission.reason })
          continue
        }
        const stats = fs.statSync(permission.resolvedPath)
        if (check.type === 'file_exists') {
          items.push({ name: label, status: stats.isFile() ? 'passed' : 'failed', message: stats.isFile() ? '文件存在' : '路径存在但不是文件' })
        } else if (check.type === 'directory_exists') {
          items.push({ name: label, status: stats.isDirectory() ? 'passed' : 'failed', message: stats.isDirectory() ? '目录存在' : '路径存在但不是目录' })
        } else {
          if (!stats.isFile()) {
            items.push({ name: label, status: 'failed', message: '目标不是文件，无法检查内容' })
            continue
          }
          const text = check.text ?? ''
          if (!text) {
            items.push({ name: label, status: 'unchecked', message: '未提供要验证的文本' })
            continue
          }
          const content = fs.readFileSync(permission.resolvedPath, 'utf-8')
          const includes = content.includes(text)
          const passed = check.type === 'contains_text' ? includes : !includes
          items.push({ name: label, status: passed ? 'passed' : 'failed', message: passed ? '内容符合预期' : '内容不符合预期' })
        }
      } catch (error) {
        items.push({ name: label, status: 'failed', message: (error as Error).message })
      }
    }

    for (const artifactId of artifactIds) {
      const artifact = ArtifactStore.get(artifactId)
      if (!artifact) {
        items.push({ name: `Artifact ${artifactId}`, status: 'failed', message: 'Artifact 记录不存在' })
        continue
      }
      try {
        const absolutePath = path.resolve(rootPath, artifact.path)
        const stats = fs.statSync(absolutePath)
        items.push({ name: `Artifact: ${artifact.name}`, status: stats.isFile() && stats.size > 0 ? 'passed' : 'failed', message: stats.isFile() ? `${stats.size} bytes` : '产物路径不是文件' })
      } catch (error) {
        items.push({ name: `Artifact: ${artifact.name}`, status: 'failed', message: (error as Error).message })
      }
    }

    return createResult(items)
  },
}