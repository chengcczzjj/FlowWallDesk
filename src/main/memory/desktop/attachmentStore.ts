import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { basename, extname } from 'path'
import type { ChatAttachment, ChatAttachmentKind } from '@shared/chat-attachments'
import { MAX_ATTACHMENT_BYTES, MAX_IMAGE_ATTACHMENT_BYTES, attachmentKindFromExtension } from '@shared/chat-attachments'

/**
 * Files the user explicitly picked for a conversation. Each grant covers one
 * file the user chose; the companion can read nothing else outside a workspace.
 */
interface AttachmentGrant extends ChatAttachment {
  path: string
  conversationId: string | null
}

const MAX_GRANTS = 200
const grants = new Map<string, AttachmentGrant>()

function remember(grant: AttachmentGrant): void {
  grants.set(grant.id, grant)
  if (grants.size > MAX_GRANTS) {
    const oldest = grants.keys().next().value
    if (oldest) grants.delete(oldest)
  }
}

export const AttachmentStore = {
  async register(paths: string[], conversationId: string | null): Promise<{ attachments: ChatAttachment[]; rejected: { name: string; reason: string }[] }> {
    const attachments: ChatAttachment[] = []
    const rejected: { name: string; reason: string }[] = []
    for (const filePath of paths.slice(0, 8)) {
      const name = basename(filePath)
      try {
        const stat = await fs.stat(filePath)
        if (!stat.isFile()) {
          rejected.push({ name, reason: '只能添加文件' })
          continue
        }
        const kind: ChatAttachmentKind = attachmentKindFromExtension(extname(filePath))
        const limit = kind === 'image' ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES
        if (stat.size > limit) {
          rejected.push({ name, reason: `文件超过 ${Math.round(limit / 1024 / 1024)}MB` })
          continue
        }
        const grant: AttachmentGrant = { id: `att-${randomUUID().slice(0, 10)}`, name, kind, size: stat.size, path: filePath, conversationId }
        remember(grant)
        attachments.push({ id: grant.id, name: grant.name, kind: grant.kind, size: grant.size })
      } catch {
        rejected.push({ name, reason: '文件读取失败' })
      }
    }
    return { attachments, rejected }
  },

  get(id: string): AttachmentGrant | undefined {
    return grants.get(id)
  },

  /** Attachments stay usable in the conversation they were sent in (and in a new one they started). */
  bind(ids: readonly string[], conversationId: string): ChatAttachment[] {
    const result: ChatAttachment[] = []
    for (const id of ids) {
      const grant = grants.get(id)
      if (!grant) continue
      if (grant.conversationId && grant.conversationId !== conversationId) continue
      grant.conversationId = conversationId
      result.push({ id: grant.id, name: grant.name, kind: grant.kind, size: grant.size })
    }
    return result
  },

  listForConversation(conversationId: string): ChatAttachment[] {
    return [...grants.values()]
      .filter((grant) => grant.conversationId === conversationId)
      .map(({ id, name, kind, size }) => ({ id, name, kind, size }))
  },
}
