import path from 'node:path'
import { ipcMain, dialog, clipboard, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { ChatService } from '../memory/chat/chatService'
import { AgentRunStore } from '../memory/agent/agentRunStore'
import { ArtifactStore } from '../memory/agent/artifactStore'
import { AutomationStore, type CreateAutomationInput, type UpdateAutomationInput } from '../memory/agent/automationStore'
import { runAutomationNow } from '../memory/agent/automationScheduler'
import { ApprovalStore } from '../memory/agent/approvalStore'
import { CheckpointStore } from '../memory/agent/checkpointStore'
import { FileChangeStore } from '../memory/agent/fileChangeStore'
import { ProjectStore } from '../memory/projects/projectStore'
import { ModelConfig } from '../memory/models/config'
import { testConnection, listModels } from '../memory/models/chatModel'
import { store } from '../store'
import type { ConversationMode } from '../memory/events/types'
import type { ModelProfile } from '../memory/models/config'
import type { AgentApprovalDecision, AgentFileChangeReviewState, WorkspacePermissionProfile } from '@shared/types'

/** 当前正在进行的流式任务，用于 stop */
const activeStreams = new Map<string, AbortController>()

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveArtifactPath(id: string): { absolutePath: string; relativePath: string } | { error: string } {
  const artifact = ArtifactStore.get(id)
  if (!artifact) return { error: 'Artifact 不存在。' }
  const run = AgentRunStore.get(artifact.runId)
  const workspace = run?.workspaceId ? ProjectStore.get(run.workspaceId) : null
  const rootPath = workspace?.rootPath ?? workspace?.path
  if (!rootPath) return { error: '找不到 Workspace 路径。' }
  const absolutePath = path.resolve(rootPath, artifact.path)
  if (!isInside(rootPath, absolutePath)) return { error: 'Artifact 路径位于 Workspace 外。' }
  return { absolutePath, relativePath: artifact.path }
}

function getProjectRoot(id: string): string | null {
  const project = ProjectStore.get(id)
  return project?.rootPath ?? project?.path ?? null
}

function resolveFileChangePath(id: string): { absolutePath: string; relativePath: string } | { error: string } {
  const change = FileChangeStore.get(id)
  if (!change) return { error: '文件变更不存在。' }
  const run = AgentRunStore.get(change.runId)
  const workspace = run?.workspaceId ? ProjectStore.get(run.workspaceId) : null
  const rootPath = workspace?.rootPath ?? workspace?.path
  if (!rootPath) return { error: '找不到 Workspace 路径。' }

  const targetPath = change.type === 'deleted-to-trash' && change.backupPath ? change.backupPath : change.path
  const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.resolve(rootPath, targetPath)
  if (!path.isAbsolute(targetPath) && !isInside(rootPath, absolutePath)) return { error: '文件路径位于 Workspace 外。' }
  return { absolutePath, relativePath: change.path }
}

async function openPathOrParent(absolutePath: string): Promise<{ ok: boolean; error?: string }> {
  const fs = await import('fs')
  const targetPath = fs.existsSync(absolutePath) ? absolutePath : path.dirname(absolutePath)
  const error = await shell.openPath(targetPath)
  return error ? { ok: false, error } : { ok: true }
}

async function showPathInFolder(absolutePath: string): Promise<{ ok: boolean; error?: string }> {
  const fs = await import('fs')
  if (!fs.existsSync(absolutePath)) return openPathOrParent(absolutePath)
  const stats = fs.statSync(absolutePath)
  if (stats.isDirectory()) return openPathOrParent(absolutePath)
  shell.showItemInFolder(absolutePath)
  return { ok: true }
}

export function registerChatIpc(): void {
  // ─── 聊天 ────────────────────────────────────────────────
  ipcMain.on(
    IPC.CHAT_SEND_MESSAGE,
    (event, payload: { conversationId?: string; projectId?: string | null; mode?: ConversationMode; text: string; internal?: boolean; forceAgentRun?: boolean }) => {
      const sender = event.sender
      const streamId = `${Date.now()}`
      const controller = new AbortController()
      activeStreams.set(streamId, controller)

      ChatService.sendMessage(
        {
          conversationId: payload.conversationId,
          projectId: payload.projectId,
          mode: payload.mode,
          text: payload.text,
          internal: payload.internal,
          forceAgentRun: payload.forceAgentRun,
          abortSignal: controller.signal,
        },
        {
          onToken(delta) {
            if (!sender.isDestroyed()) {
              sender.send(IPC.CHAT_STREAM_CHUNK, { streamId, delta })
            }
          },
          onDone(full, conversationId) {
            activeStreams.delete(streamId)
            if (!sender.isDestroyed()) {
              sender.send(IPC.CHAT_STREAM_END, { streamId, full, conversationId })
            }
          },
          onError(error) {
            activeStreams.delete(streamId)
            if (!sender.isDestroyed()) {
              sender.send(IPC.CHAT_STREAM_ERROR, { streamId, error })
            }
          },
          onToolCall(event) {
            if (!sender.isDestroyed()) {
              sender.send(IPC.CHAT_TOOL_CALL, { streamId, ...event })
            }
          },
          onRunEvent(runEvent) {
            if (!sender.isDestroyed()) {
              sender.send(IPC.AGENT_RUN_EVENT, { streamId, ...runEvent })
            }
          },
        }
      )

      // 返回 streamId 让前端可以追踪
      event.returnValue = streamId
    }
  )

  ipcMain.handle(IPC.CHAT_STOP_STREAM, (_e, streamId: string) => {
    const controller = activeStreams.get(streamId)
    if (!controller) return { ok: false, error: '没有找到正在运行的任务。' }
    controller.abort()
    activeStreams.delete(streamId)
    return { ok: true }
  })

  ipcMain.handle(
    IPC.CHAT_NEW_CONVERSATION,
    (_e, mode?: ConversationMode) => ChatService.createConversation(mode)
  )

  ipcMain.handle(
    IPC.CHAT_LIST_CONVERSATIONS,
    () => ChatService.listConversations()
  )

  ipcMain.handle(
    IPC.CHAT_GET_HISTORY,
    (_e, conversationId: string, limit?: number) => ChatService.getHistory(conversationId, limit)
  )

  ipcMain.handle(
    IPC.CHAT_DELETE_CONVERSATION,
    (_e, id: string) => { ChatService.deleteConversation(id); return true }
  )

  ipcMain.handle(
    IPC.CHAT_RENAME_CONVERSATION,
    (_e, id: string, title: string) => { ChatService.renameConversation(id, title); return true }
  )

  ipcMain.handle(
    IPC.CHAT_ARCHIVE_CONVERSATION,
    (_e, id: string) => { ChatService.archiveConversation(id); return true }
  )

  ipcMain.handle(
    IPC.CHAT_UNARCHIVE_CONVERSATION,
    (_e, id: string) => { ChatService.unarchiveConversation(id); return true }
  )

  ipcMain.handle(
    IPC.CHAT_MOVE_CONVERSATION,
    (_e, id: string, projectId: string | null) => { ChatService.moveConversationToProject(id, projectId); return true }
  )

  ipcMain.handle(
    IPC.CHAT_EXPORT_CONVERSATION,
    async (_e, id: string) => {
      const markdown = ChatService.exportConversation(id)
      const result = await dialog.showSaveDialog({
        defaultPath: `对话导出-${Date.now()}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!result.canceled && result.filePath) {
        const fs = await import('fs/promises')
        await fs.writeFile(result.filePath, markdown, 'utf-8')
        return true
      }
      return false
    }
  )

  // ─── 模型 Profile 管理 ──────────────────────────────────
  ipcMain.handle(IPC.CHAT_LIST_PROFILES, () => {
    const profiles = ModelConfig.listProfiles()
    // 返回时隐藏 apiKey 中间部分
    return profiles.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}` : '',
    }))
  })

  ipcMain.handle(IPC.CHAT_GET_ACTIVE_PROFILE, () => {
    const p = ModelConfig.getActive()
    if (!p) return null
    return { ...p, apiKey: p.apiKey ? `${p.apiKey.slice(0, 6)}...${p.apiKey.slice(-4)}` : '' }
  })

  ipcMain.handle(IPC.CHAT_UPSERT_PROFILE, (_e, profile: ModelProfile) => {
    ModelConfig.upsertProfile(profile)
    return true
  })

  ipcMain.handle(IPC.CHAT_DELETE_PROFILE, (_e, id: string) => {
    ModelConfig.deleteProfile(id)
    return true
  })

  ipcMain.handle(IPC.CHAT_SET_ACTIVE_PROFILE, (_e, id: string) => {
    ModelConfig.setActive(id)
    return true
  })

  ipcMain.handle(IPC.CHAT_TEST_PROFILE, async (_e, profile: ModelProfile) => {
    return testConnection(profile)
  })

  ipcMain.handle(IPC.CHAT_LIST_MODELS, async (_e, profile: ModelProfile) => {
    return listModels(profile)
  })

  // ─── 人设 Persona ──────────────────────────────────────
  ipcMain.handle(IPC.CHAT_SAVE_PERSONA, (_e, persona: { name: string; prompt: string; avatar?: string }) => {
    store.set('persona', persona)
    return true
  })

  ipcMain.handle(IPC.CHAT_GET_PERSONA, () => {
    return store.get('persona') ?? { name: '灵月', prompt: '', avatar: '' }
  })

  // ─── AgentRun ──────────────────────────────────────────
  ipcMain.handle(IPC.AGENT_RUN_LIST_BY_THREAD, (_e, threadId: string) => {
    return AgentRunStore.listByThread(threadId)
  })

  ipcMain.handle(IPC.AGENT_RUN_GET, (_e, id: string) => {
    return AgentRunStore.get(id) ?? null
  })

  ipcMain.handle(IPC.AGENT_APPROVAL_LIST_BY_RUN, (_e, runId: string) => {
    return ApprovalStore.listByRun(runId)
  })

  ipcMain.handle(IPC.AGENT_APPROVAL_RESOLVE, (_e, id: string, decision: AgentApprovalDecision) => {
    return ApprovalStore.resolve(id, decision) ?? null
  })

  ipcMain.handle(IPC.AGENT_FILE_CHANGE_LIST_BY_RUN, (_e, runId: string) => {
    return FileChangeStore.listByRun(runId)
  })

  ipcMain.handle(IPC.AGENT_FILE_CHANGE_SET_REVIEW_STATE, (_e, id: string, reviewState: AgentFileChangeReviewState) => {
    return FileChangeStore.updateReviewState(id, reviewState) ?? null
  })

  ipcMain.handle(IPC.AGENT_FILE_CHANGE_RESTORE, (_e, id: string) => {
    const change = FileChangeStore.get(id)
    if (!change?.checkpointId) return { ok: false, error: '该变更没有可恢复 checkpoint。' }
    const run = AgentRunStore.get(change.runId)
    const workspace = run?.workspaceId ? ProjectStore.get(run.workspaceId) : null
    const rootPath = workspace?.rootPath ?? workspace?.path
    if (!rootPath) return { ok: false, error: '找不到 Workspace 路径。' }
    const restorePath = change.oldPath ?? change.path
    const result = CheckpointStore.restore(change.checkpointId, rootPath, [restorePath])
    FileChangeStore.updateReviewState(id, 'restored')
    return { ok: true, ...result }
  })

  ipcMain.handle(IPC.AGENT_FILE_CHANGE_OPEN, async (_e, id: string) => {
    const resolved = resolveFileChangePath(id)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    return openPathOrParent(resolved.absolutePath)
  })

  ipcMain.handle(IPC.AGENT_FILE_CHANGE_SHOW_IN_FOLDER, async (_e, id: string) => {
    const resolved = resolveFileChangePath(id)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    return showPathInFolder(resolved.absolutePath)
  })

  ipcMain.handle(IPC.AGENT_ARTIFACT_LIST_BY_RUN, (_e, runId: string) => {
    return ArtifactStore.listByRun(runId)
  })

  ipcMain.handle(IPC.AGENT_ARTIFACT_OPEN, async (_e, id: string) => {
    const resolved = resolveArtifactPath(id)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    const error = await shell.openPath(resolved.absolutePath)
    return error ? { ok: false, error } : { ok: true }
  })

  ipcMain.handle(IPC.AGENT_ARTIFACT_SHOW_IN_FOLDER, async (_e, id: string) => {
    const resolved = resolveArtifactPath(id)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    return showPathInFolder(resolved.absolutePath)
  })

  ipcMain.handle(IPC.AGENT_ARTIFACT_COPY_PATH, (_e, id: string) => {
    const resolved = resolveArtifactPath(id)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    clipboard.writeText(resolved.relativePath)
    return { ok: true, path: resolved.relativePath }
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_LIST, () => {
    return AutomationStore.list()
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_CREATE, (_e, data: CreateAutomationInput) => {
    return AutomationStore.create(data)
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_UPDATE, (_e, id: string, data: UpdateAutomationInput) => {
    return AutomationStore.update(id, data)
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_DELETE, (_e, id: string) => {
    return AutomationStore.softDelete(id)
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_RUN_NOW, (_e, id: string) => {
    return runAutomationNow(id)
  })

  ipcMain.handle(IPC.AGENT_AUTOMATION_RESULT_LIST, (_e, automationId?: string) => {
    return AutomationStore.listResults(automationId)
  })

  // ─── 项目管理 ──────────────────────────────────────────
  ipcMain.handle(IPC.PROJECT_CREATE, (_e, data: { name: string; path?: string; icon?: string; color?: string }) => {
    return ProjectStore.create(data.name, data.path, data.icon, data.color)
  })

  ipcMain.handle(IPC.PROJECT_LIST, () => {
    return ProjectStore.list()
  })

  ipcMain.handle(IPC.PROJECT_GET, (_e, id: string) => {
    return ProjectStore.get(id) ?? null
  })

  ipcMain.handle(IPC.PROJECT_UPDATE, (_e, id: string, data: { name?: string; path?: string; icon?: string; color?: string; permissionProfile?: WorkspacePermissionProfile }) => {
    ProjectStore.update(id, data)
    return true
  })

  ipcMain.handle(IPC.PROJECT_DELETE, (_e, id: string) => {
    ProjectStore.delete(id)
    return true
  })

  ipcMain.handle(IPC.PROJECT_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.PROJECT_OPEN_FOLDER, async (_e, id: string) => {
    const rootPath = getProjectRoot(id)
    if (!rootPath) return { ok: false, error: '找不到项目文件夹。' }
    const error = await shell.openPath(rootPath)
    return error ? { ok: false, error } : { ok: true }
  })
}
