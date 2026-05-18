import { ConversationStore } from '../conversations/conversationStore'
import { EventStore } from '../events/eventStore'
import { AgentRunStore } from '../agent/agentRunStore'
import { RunCancellation } from '../agent/runCancellation'
import { createAgentRunTitle, createInitialAgentPlan, shouldCreateAgentRun, updatePlanForRunStatus } from '../agent/agentPlanner'
import { ProjectStore } from '../projects/projectStore'
import { classifyBasic } from '../routing/sceneRouter'
import { buildInitialContext } from '../routing/contextPacker'
import { ModelConfig } from '../models/config'
import { streamChat } from '../models/chatModel'
import { getToolSet, REGISTERED_TOOL_NAMES, type ToolCallEvent } from '../tools'
import { buildToolRouterPrompt } from '../tools/toolRouter'
import { store } from '../../store'
import type { ConversationMode } from '../events/types'
import type { ConversationRecord } from '../conversations/conversationStore'
import type { AgentApproval, AgentRunEvent, AgentRunStatus } from '@shared/types'
import type { ToolSet } from 'ai'

export interface SendMessageParams {
  conversationId?: string
  projectId?: string | null
  mode?: ConversationMode
  text: string
  internal?: boolean
  forceAgentRun?: boolean
  abortSignal?: AbortSignal
}

export interface ChatStreamCallbacks {
  onToken: (delta: string) => void
  onDone: (full: string, conversationId: string) => void
  onError: (error: string) => void
  onToolCall?: (event: ToolCallEvent) => void
  onRunEvent?: (event: AgentRunEvent) => void
}

function extractContextFiles(output: unknown): string[] {
  if (!output || typeof output !== 'object') return []
  const value = (output as { contextFiles?: unknown }).contextFiles
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function extractApproval(output: unknown): AgentApproval | null {
  if (!output || typeof output !== 'object') return null
  const value = (output as { approval?: unknown }).approval
  if (!value || typeof value !== 'object') return null
  return value as AgentApproval
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && ((error as Error).name === 'AbortError' || (error as Error).message?.includes('abort')))
}

function createAbortError(): Error {
  const error = new Error('用户已停止任务。')
  error.name = 'AbortError'
  return error
}

function getSavedPersonaPrompt(): string | undefined {
  const persona = store.get('persona')
  const prompt = persona?.prompt?.trim()
  if (!prompt) return undefined

  const name = persona?.name?.trim()
  return name ? `${prompt}\n\n【当前人设名称】${name}` : prompt
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const CACHED_READ_TOOL_NAMES = new Set([
  'get_current_time',
  'get_user_location',
  'calculator',
  'web_search',
  'get_system_info',
  'memory_recall',
  'weather',
  'news',
  'list_directory',
  'read_file',
  'search_text',
  'get_file_info',
  'compare_file_versions',
  'extract_pdf_text',
  'read_docx',
  'read_xlsx',
  'ocr_image',
])

type ExecutableTool = { execute?: (...args: unknown[]) => unknown }

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function normalizeToolCacheInput(toolName: string, input: unknown): unknown {
  if (toolName === 'get_user_location') {
    const record = asRecord(input)
    const precision = typeof record?.precision === 'string' ? record.precision : 'auto'
    return { refresh: record?.refresh === true, precision }
  }
  if (toolName === 'weather') {
    const record = asRecord(input)
    const city = typeof record?.city === 'string'
      ? record.city.trim().replace(/市$/, '').toLowerCase()
      : ''
    const days = typeof record?.days === 'number' ? record.days : 3
    return { city, days }
  }
  return input
}

function toolCacheKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableStringify(normalizeToolCacheInput(toolName, input))}`
}

function shouldCacheToolCall(toolName: string): boolean {
  return CACHED_READ_TOOL_NAMES.has(toolName)
}

function createCachedToolSet(tools: ToolSet): ToolSet {
  const cache = new Map<string, Promise<unknown>>()
  const wrapped: Record<string, unknown> = {}

  for (const [toolName, toolDef] of Object.entries(tools)) {
    const executable = toolDef as ExecutableTool
    if (!shouldCacheToolCall(toolName) || typeof executable.execute !== 'function') {
      wrapped[toolName] = toolDef
      continue
    }

    wrapped[toolName] = {
      ...toolDef,
      execute: (...args: unknown[]) => {
        const key = toolCacheKey(toolName, args[0])
        const existing = cache.get(key)
        if (existing) return existing
        const promise = Promise.resolve(executable.execute!(...args))
        cache.set(key, promise)
        return promise
      },
    }
  }

  return wrapped as ToolSet
}

function booleanValue(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key]
  return typeof value === 'boolean' ? value : null
}

function stringValue(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function isApprovalToolOutput(output: unknown): boolean {
  return booleanValue(asRecord(output), 'approvalRequired') === true || Boolean(extractApproval(output))
}

function isFailedToolOutput(output: unknown, error?: unknown): boolean {
  if (error) return true
  const record = asRecord(output)
  return booleanValue(record, 'ok') === false && !isApprovalToolOutput(output)
}

function summarizeToolFailure(toolName: string, output: unknown, error?: unknown): string {
  if (error) return `${toolName}: ${String(error)}`
  const record = asRecord(output)
  const message = stringValue(record, 'error') ?? stringValue(record, 'message') ?? '工具返回 ok=false。'
  const path = stringValue(record, 'path')
  return path ? `${toolName}(${path}): ${message}` : `${toolName}: ${message}`
}

const DELIVERY_TOOL_NAMES = new Set([
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
  'verify_workspace_result',
])

function isSuccessfulDelivery(toolName: string, output: unknown): boolean {
  const record = asRecord(output)
  return DELIVERY_TOOL_NAMES.has(toolName) && booleanValue(record, 'ok') === true
}

function summarizeSuccessfulDelivery(toolName: string, output: unknown): string {
  const record = asRecord(output)
  const change = asRecord(record?.change)
  const artifact = asRecord(record?.artifact)
  const path = stringValue(record, 'path') ?? stringValue(change, 'path') ?? stringValue(artifact, 'path')
  if (path) return `${toolName}: ${path}`
  if (toolName === 'verify_workspace_result') return 'verify_workspace_result: 验证通过'
  return `${toolName}: 已完成`
}

const AGENT_RUN_TOOL_NAMES = new Set<string>(REGISTERED_TOOL_NAMES)

const WRITE_TOOL_NAMES = new Set([
  'create_file',
  'patch_file',
  'write_file',
  'create_directory',
  'copy_path',
  'move_path',
  'delete_to_trash',
  'restore_from_trash',
  'generate_artifact',
  'write_docx',
  'write_xlsx',
])

const READ_TOOL_NAMES = new Set([
  'list_directory',
  'read_file',
  'search_text',
  'get_file_info',
  'get_user_location',
  'web_search',
  'weather',
  'news',
  'extract_pdf_text',
  'read_docx',
  'read_xlsx',
  'ocr_image',
])

function shouldAttachAgentRunForTool(toolName: string): boolean {
  return AGENT_RUN_TOOL_NAMES.has(toolName)
}

function getToolPlanHint(toolName: string): string {
  if (WRITE_TOOL_NAMES.has(toolName)) return '写入文件 生成产物 验证结果'
  if (toolName === 'run_command') return '运行命令 验证结果'
  if (toolName.includes('checkpoint')) return '创建快照 验证结果'
  if (READ_TOOL_NAMES.has(toolName)) return '读取文件 搜索信息 分析上下文'
  return '使用工具 获取信息 整理回复'
}

function summarizeCompletedTool(toolName: string, output: unknown): string {
  const record = asRecord(output)
  const path = stringValue(record, 'path')
  const formatted = stringValue(record, 'formatted')
  const abstract = stringValue(record, 'abstract')
  const location = stringValue(record, 'location')
  const result = record?.result

  if (formatted) return `${toolName}: ${formatted}`
  if (typeof result === 'number' || typeof result === 'string') return `${toolName}: ${result}`
  if (path) return `${toolName}: ${path}`
  if (abstract) return `${toolName}: ${abstract}`
  if (location) return `${toolName}: ${location}`
  return `${toolName}: 已完成`
}

export const ChatService = {
  /** 发送消息并流式返回回复（支持 tool calling 多步推理） */
  async sendMessage(params: SendMessageParams, callbacks: ChatStreamCallbacks): Promise<void> {
    const { text, mode = 'daily' } = params

    // 1. 获取/创建会话
    const conv = ConversationStore.getOrCreate(params.conversationId, mode, params.projectId)
    const workspaceId = conv.projectId ?? params.projectId ?? null
    const workspace = workspaceId ? ProjectStore.get(workspaceId) : undefined
    const toolContext = { workspaceId, runId: undefined as string | undefined, threadId: conv.id }
    const shouldTrackRun = shouldCreateAgentRun({ intent: text, workspace, force: params.forceAgentRun })
    let currentPlan = [] as ReturnType<typeof createInitialAgentPlan>
    let run: ReturnType<typeof AgentRunStore.create> | null = null
    let registeredRunId: string | null = null
    const ensureAgentRun = (initialStatus: AgentRunStatus = 'scoping', planHint = '') => {
      if (run) return run
      const planIntent = planHint ? `${text}\n${planHint}` : text
      currentPlan = createInitialAgentPlan({ intent: planIntent, workspace })
      if (initialStatus !== 'scoping') currentPlan = updatePlanForRunStatus(currentPlan, initialStatus)
      run = AgentRunStore.create({
        threadId: conv.id,
        workspaceId,
        intent: createAgentRunTitle({ intent: planIntent, workspace }),
        status: initialStatus,
        plan: currentPlan,
      })
      toolContext.runId = run.id
      RunCancellation.register(run.id, params.abortSignal)
      registeredRunId = run.id
      callbacks.onRunEvent?.({
        type: 'run.started',
        runId: run.id,
        threadId: conv.id,
        workspaceId,
        status: run.status,
        run,
        createdAt: Date.now(),
      })
      return run
    }
    if (shouldTrackRun) ensureAgentRun()
    let hasPendingApproval = false
    const toolFailures: string[] = []
    const successfulDeliveries: string[] = []
    const completedToolSummaries: string[] = []
    let full = ''
    const emitRunStatus = (status: AgentRunStatus, summary?: string) => {
      if (!run) return
      currentPlan = updatePlanForRunStatus(currentPlan, status)
      AgentRunStore.updatePlan(run.id, currentPlan)
      AgentRunStore.updateStatus(run.id, status, summary)
      const latest = AgentRunStore.get(run.id)
      callbacks.onRunEvent?.({
        type: status === 'completed' ? 'run.completed' : status === 'failed' ? 'run.failed' : status === 'cancelled' ? 'run.cancelled' : 'run.status_changed',
        runId: run.id,
        threadId: conv.id,
        workspaceId,
        status,
        summary,
        run: latest,
        createdAt: Date.now(),
      })
    }
    // 2. 场景判断（规则版）
    const scene = classifyBasic({ mode: conv.mode as ConversationMode, text })
    emitRunStatus('loading-context')

    // 3. 写入用户消息
    EventStore.append({
      conversationId: conv.id,
      eventType: params.internal ? 'system_event' : 'user_message',
      mode: conv.mode as ConversationMode,
      content: params.internal ? { type: 'internal_instruction', text } : { text },
    })

    // 4. 获取最近消息构建上下文
    const recent = EventStore.listRecent(conv.id, 30)
    const { system, messages } = buildInitialContext({ scene, recentEvents: recent, persona: getSavedPersonaPrompt() })
    if (params.internal) messages.push({ role: 'user', content: text })
    const toolRouterSystem = buildToolRouterPrompt({ workspace })
    const workspaceRoot = workspace?.rootPath ?? workspace?.path
    const workspaceName = workspace?.displayName ?? workspace?.name ?? '当前工作区'
    const workspaceSystem = workspaceRoot
      ? `${system}\n\n${toolRouterSystem}\n\n【当前工作文件夹】\n名称：${workspaceName}\n路径：${workspaceRoot}`
      : `${system}\n\n${toolRouterSystem}`

    // 5. 获取 model profile
    const profile = ModelConfig.getActive()
    if (!profile) {
      emitRunStatus('failed', '未配置模型。请在设置中添加模型 Profile。')
      callbacks.onError('未配置模型。请在设置中添加模型 Profile。')
      return
    }

    // 6. 获取工具集
    const rawTools = getToolSet(toolContext)
    const tools = createCachedToolSet(rawTools)
    const visibleToolOffsets = new Map<string, number>()
    const hiddenDuplicateToolCallIds = new Set<string>()

    // 7. 流式调用（带 tool calling 支持）
    try {
      if (params.abortSignal?.aborted) throw createAbortError()
      emitRunStatus('executing')
      const result = await streamChat(profile, messages, {
        system: workspaceSystem,
        tools,
        maxSteps: 8,
        abortSignal: params.abortSignal,
        toolCallbacks: {
          onTextDelta(delta) {
            full += delta
            callbacks.onToken(delta)
          },
          onToolCallStart({ toolName, toolCallId, input }) {
            if (shouldCacheToolCall(toolName)) {
              const key = toolCacheKey(toolName, input)
              const previousOffset = visibleToolOffsets.get(key)
              if (previousOffset === full.length) {
                hiddenDuplicateToolCallIds.add(toolCallId)
                return
              }
              visibleToolOffsets.set(key, full.length)
            }
            if (!run && shouldAttachAgentRunForTool(toolName)) {
              ensureAgentRun('executing', getToolPlanHint(toolName))
            }
            if (run && toolName === 'create_checkpoint') {
              currentPlan = updatePlanForRunStatus(currentPlan, 'checkpointing')
              AgentRunStore.updatePlan(run.id, currentPlan)
              AgentRunStore.updateStatus(run.id, 'checkpointing', '正在创建文件快照')
            } else if (run && toolName === 'verify_workspace_result') {
              currentPlan = updatePlanForRunStatus(currentPlan, 'verifying')
              AgentRunStore.updatePlan(run.id, currentPlan)
              AgentRunStore.updateStatus(run.id, 'verifying', '正在验证任务结果')
            }
            const latest = run ? AgentRunStore.appendToolCall(run.id, toolName) : undefined
            if (run) {
              callbacks.onRunEvent?.({
                type: 'run.status_changed',
                runId: run.id,
                threadId: conv.id,
                workspaceId,
                status: toolName === 'create_checkpoint' ? 'checkpointing' : toolName === 'verify_workspace_result' ? 'verifying' : latest?.status ?? 'executing',
                run: latest,
                createdAt: Date.now(),
              })
            }
            // 记录 tool_call 事件
            EventStore.append({
              conversationId: conv.id,
              eventType: 'tool_call',
              mode: conv.mode as ConversationMode,
              content: { toolCallId, toolName, input, textOffset: full.length },
            })
            callbacks.onToolCall?.({
              toolCallId,
              toolName,
              input,
              status: 'start',
            })
          },
          onToolCallFinish({ toolName, toolCallId, output, error, durationMs }) {
            if (hiddenDuplicateToolCallIds.has(toolCallId)) {
              hiddenDuplicateToolCallIds.delete(toolCallId)
              return
            }
            const contextFiles = extractContextFiles(output)
            const approval = extractApproval(output)
            const failedTool = isFailedToolOutput(output, error)
            if (isSuccessfulDelivery(toolName, output)) {
              successfulDeliveries.push(summarizeSuccessfulDelivery(toolName, output))
            } else if (!failedTool && !approval) {
              completedToolSummaries.push(summarizeCompletedTool(toolName, output))
            }
            if (failedTool) {
              toolFailures.push(summarizeToolFailure(toolName, output, error))
            }
            if (approval && run) {
              hasPendingApproval = true
              currentPlan = updatePlanForRunStatus(currentPlan, 'waiting-approval')
              AgentRunStore.updatePlan(run.id, currentPlan)
              AgentRunStore.updateStatus(run.id, 'waiting-approval', approval.reason)
            }
            const latest = run && contextFiles.length > 0
              ? AgentRunStore.appendContextFiles(run.id, contextFiles)
              : run ? AgentRunStore.get(run.id) : undefined
            if (approval && run) {
              callbacks.onRunEvent?.({
                type: 'approval.requested',
                runId: run.id,
                threadId: conv.id,
                workspaceId,
                status: 'waiting-approval',
                summary: approval.reason,
                run: latest,
                createdAt: Date.now(),
              })
            }
            if (run && contextFiles.length > 0) {
              callbacks.onRunEvent?.({
                type: 'run.status_changed',
                runId: run.id,
                threadId: conv.id,
                workspaceId,
                status: latest?.status ?? 'executing',
                summary: `${toolName} 读取了 ${contextFiles.length} 个上下文路径`,
                run: latest,
                createdAt: Date.now(),
              })
            }
            // 记录 tool_result 事件
            EventStore.append({
              conversationId: conv.id,
              eventType: 'tool_result',
              mode: conv.mode as ConversationMode,
              content: {
                toolCallId,
                toolName,
                output: error ? undefined : output,
                error: error ? String(error) : undefined,
                durationMs,
              },
            })
            callbacks.onToolCall?.({
              toolCallId,
              toolName,
              input: undefined,
              status: failedTool ? 'error' : 'complete',
              output,
              error: error ? String(error) : undefined,
              durationMs,
            })
          },
          onStepFinish({ stepNumber, finishReason }) {
            // 当 Agent 循环达到 stop 条件时记录
            if (finishReason === 'stop' && stepNumber > 0) {
              EventStore.append({
                conversationId: conv.id,
                eventType: 'system_event',
                mode: conv.mode as ConversationMode,
                content: { type: 'agent_loop_complete', steps: stepNumber + 1 },
              })
            }
          },
        },
      })

      for await (const chunk of result.textStream) {
        if (params.abortSignal?.aborted) throw createAbortError()
        full += chunk
        callbacks.onToken(chunk)
      }

      const finalStreamText = (await result.text).trim()
      if (finalStreamText && finalStreamText !== full.trim()) {
        full = finalStreamText
      }

      // 8. 写入 AI 回复
      const failedSummary = toolFailures.slice(0, 3)
      const assistantText = hasPendingApproval
        ? [full.trim(), '需要授权后继续。'].filter(Boolean).join('\n\n')
        : failedSummary.length > 0 && successfulDeliveries.length === 0
          ? [
              '工具执行未完成，未生成最终交付结果。',
              ...failedSummary.map((item) => `- ${item}`),
              '请调整权限、路径或工具参数后重试。',
            ].join('\n')
          : full.trim() || (successfulDeliveries.length > 0
              ? ['已完成本轮任务。', ...successfulDeliveries.slice(0, 3).map((item) => `- ${item}`)].join('\n')
              : completedToolSummaries.length > 0
                ? ['工具已执行完成，但模型没有继续生成总结。', ...completedToolSummaries.slice(0, 3).map((item) => `- ${item}`)].join('\n')
                : full)

      if (!assistantText.trim()) {
        const finishReason = await Promise.resolve(result.finishReason).catch(() => undefined)
        const rawFinishReason = await Promise.resolve(result.rawFinishReason).catch(() => undefined)
        const reasonText = [finishReason, rawFinishReason].filter(Boolean).join(' / ')
        throw new Error(reasonText
          ? `模型没有返回可显示内容（${reasonText}）。请稍后重试或切换模型。`
          : '模型没有返回可显示内容。请稍后重试或切换模型。')
      }

      EventStore.append({
        conversationId: conv.id,
        eventType: 'assistant_message',
        mode: conv.mode as ConversationMode,
        content: { text: assistantText },
      })

      // 9. 更新会话活跃时间
      ConversationStore.touch(conv.id)

      // 10. 首条消息时自动生成标题
      if (!params.internal && !conv.title && assistantText) {
        const title = text.slice(0, 30) + (text.length > 30 ? '…' : '')
        ConversationStore.updateTitle(conv.id, title)
      }

      emitRunStatus(
        hasPendingApproval ? 'waiting-approval' : failedSummary.length > 0 ? 'failed' : 'completed',
        hasPendingApproval ? '等待用户确认后继续' : assistantText.slice(0, 200),
      )
      callbacks.onDone(assistantText, conv.id)
    } catch (e) {
      if (params.abortSignal?.aborted || isAbortError(e)) {
        const partial = full.trim()
        const message = partial || '已停止运行。已完成的步骤会保留在任务记录里。'
        EventStore.append({
          conversationId: conv.id,
          eventType: 'assistant_message',
          mode: conv.mode as ConversationMode,
          content: { text: message },
        })
        ConversationStore.touch(conv.id)
        emitRunStatus('cancelled', partial ? '用户已停止，已保留部分输出。' : '用户已停止任务。')
        callbacks.onDone(message, conv.id)
        return
      }
      emitRunStatus('failed', (e as Error).message)
      callbacks.onError((e as Error).message)
    } finally {
      if (registeredRunId) RunCancellation.unregister(registeredRunId)
    }
  },

  /** 创建新会话 */
  createConversation(mode: ConversationMode = 'daily'): ConversationRecord {
    return ConversationStore.create(mode)
  },

  /** 列出所有会话 */
  listConversations() {
    return ConversationStore.list()
  },

  /** 列出指定项目的会话 */
  listConversationsByProject(projectId: string) {
    return ConversationStore.listByProject(projectId)
  },

  /** 列出不属于项目的会话 */
  listConversationsWithoutProject() {
    return ConversationStore.listWithoutProject()
  },

  /** 获取会话历史消息 */
  getHistory(conversationId: string, limit = 100) {
    return EventStore.listRecent(conversationId, limit)
  },

  /** 删除会话 */
  deleteConversation(id: string) {
    ConversationStore.delete(id)
  },

  /** 重命名会话 */
  renameConversation(id: string, title: string) {
    ConversationStore.updateTitle(id, title)
  },

  /** 归档会话 */
  archiveConversation(id: string) {
    ConversationStore.archive(id)
  },

  /** 取消归档 */
  unarchiveConversation(id: string) {
    ConversationStore.unarchive(id)
  },

  /** 移动会话到项目 */
  moveConversationToProject(id: string, projectId: string | null) {
    ConversationStore.updateProject(id, projectId)
  },

  /** 导出会话为 Markdown */
  exportConversation(id: string): string {
    const conv = ConversationStore.list().find(c => c.id === id)
    const events = EventStore.listRecent(id, 500)
    const title = conv?.title || '新对话'
    const lines = [`# ${title}\n`]
    for (const e of events) {
      if (e.eventType === 'user_message') {
        lines.push(`## 👤 用户\n${e.content.text}\n`)
      } else if (e.eventType === 'assistant_message') {
        lines.push(`## 🤖 灵月\n${e.content.text}\n`)
      }
    }
    return lines.join('\n')
  },
}
