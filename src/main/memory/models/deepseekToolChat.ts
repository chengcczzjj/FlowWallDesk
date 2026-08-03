import { asSchema, executeTool, generateId, safeValidateTypes } from '@ai-sdk/provider-utils'
import type { JSONSchema7 } from '@ai-sdk/provider'
import type { FinishReason, ModelMessage, ToolSet } from 'ai'
import type { ModelProfile } from './config'
import type { ToolCallbacks } from './chatModel'

interface DeepSeekToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  reasoning_content?: string
  tool_calls?: DeepSeekToolCall[]
  tool_call_id?: string
}

interface DeepSeekStreamChunk {
  choices?: Array<{
    delta?: {
      role?: 'assistant'
      content?: string | null
      reasoning_content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

interface DeepSeekStreamMessage {
  content: string
  reasoning_content?: string
  tool_calls: DeepSeekToolCall[]
  finish_reason?: string | null
}

export interface DeepSeekToolChatResult {
  textStream: AsyncIterable<string>
  text: PromiseLike<string>
  finishReason: PromiseLike<FinishReason>
  rawFinishReason: PromiseLike<string | undefined>
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function mapFinishReason(reason?: string | null): FinishReason {
  if (reason === 'stop') return 'stop'
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool-calls'
  if (reason === 'length') return 'length'
  if (reason === 'content_filter') return 'content-filter'
  if (reason == null) return 'other'
  return 'other'
}

function modelContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      if (record.type === 'text' && typeof record.text === 'string') return record.text
      if (record.type === 'reasoning' && typeof record.text === 'string') return record.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function toDeepSeekMessages(system: string | undefined, messages: ModelMessage[]): DeepSeekMessage[] {
  const result: DeepSeekMessage[] = []
  if (system?.trim()) result.push({ role: 'system', content: system })

  for (const message of messages) {
    if (message.role === 'system') {
      result.push({ role: 'system', content: modelContentToText(message.content) })
    } else if (message.role === 'user') {
      result.push({ role: 'user', content: modelContentToText(message.content) })
    } else if (message.role === 'assistant') {
      result.push({ role: 'assistant', content: modelContentToText(message.content) })
    }
  }

  return result
}

async function toDeepSeekTools(tools: ToolSet | undefined) {
  if (!tools) return undefined
  const entries = await Promise.all(Object.entries(tools).map(async ([name, tool]) => {
    if (tool.type === 'provider') return null
    const jsonSchema = await asSchema(tool.inputSchema).jsonSchema as JSONSchema7
    return {
      type: 'function' as const,
      function: {
        name,
        description: tool.description,
        parameters: jsonSchema,
        ...(tool.strict != null ? { strict: tool.strict } : {}),
      },
    }
  }))
  const definitions = entries.filter((item): item is NonNullable<typeof item> => Boolean(item))
  return definitions.length > 0 ? definitions : undefined
}

async function streamDeepSeekChatCompletion(params: {
  profile: ModelProfile
  baseURL: string
  messages: DeepSeekMessage[]
  tools?: Awaited<ReturnType<typeof toDeepSeekTools>>
  thinkingEnabled: boolean
  maxOutputTokens: number
  abortSignal?: AbortSignal
  onContentDelta?: (delta: string) => void
}): Promise<DeepSeekStreamMessage> {
  const {
    profile,
    baseURL,
    messages,
    tools,
    thinkingEnabled,
    maxOutputTokens,
    abortSignal,
    onContentDelta,
  } = params
  const body = removeUndefined({
    model: profile.model,
    messages,
    tools,
    tool_choice: tools ? 'auto' : undefined,
    thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
    reasoning_effort: thinkingEnabled ? 'high' : undefined,
    temperature: thinkingEnabled ? undefined : profile.temperature,
    max_tokens: profile.maxTokens == null
      ? undefined
      : Math.min(profile.maxTokens, maxOutputTokens),
    stream: true,
  })

  const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey.trim()}`,
      'Content-Type': 'application/json',
      ...profile.headers,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  })

  if (!response.ok) {
    const raw = await response.text()
    let data: DeepSeekStreamChunk | undefined
    try {
      data = raw ? JSON.parse(raw) as DeepSeekStreamChunk : undefined
    } catch {
      data = undefined
    }
    const message = data?.error?.message ?? raw.slice(0, 500) ?? `HTTP ${response.status}`
    throw new Error(`DeepSeek API ${response.status}: ${message}`)
  }

  if (!response.body) return { content: '', tool_calls: [] }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const toolCallParts = new Map<number, DeepSeekToolCall>()
  let buffer = ''
  let content = ''
  let reasoningContent = ''
  let finishReason: string | null | undefined

  const appendToolName = (current: string, next?: string): string => {
    if (!next) return current
    if (!current) return next
    if (current === next || current.endsWith(next)) return current
    return `${current}${next}`
  }

  const handleData = (data: string) => {
    const trimmed = data.trim()
    if (!trimmed || trimmed === '[DONE]') return
    const chunk = JSON.parse(trimmed) as DeepSeekStreamChunk
    if (chunk.error?.message) throw new Error(`DeepSeek API: ${chunk.error.message}`)
    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    if (choice?.finish_reason !== undefined) finishReason = choice.finish_reason
    if (!delta) return

    if (delta.content) {
      content += delta.content
      onContentDelta?.(delta.content)
    }
    if (delta.reasoning_content) reasoningContent += delta.reasoning_content
    for (const toolCallDelta of delta.tool_calls ?? []) {
      const index = toolCallDelta.index ?? toolCallParts.size
      const existing = toolCallParts.get(index) ?? {
        id: '',
        type: 'function' as const,
        function: { name: '', arguments: '' },
      }
      if (toolCallDelta.id) existing.id = toolCallDelta.id
      if (toolCallDelta.function?.name) existing.function.name = appendToolName(existing.function.name, toolCallDelta.function.name)
      if (toolCallDelta.function?.arguments) existing.function.arguments += toolCallDelta.function.arguments
      toolCallParts.set(index, existing)
    }
  }

  const flushEvent = (eventText: string) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data) handleData(data)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let match = buffer.match(/\r?\n\r?\n/)
    while (match?.index != null) {
      flushEvent(buffer.slice(0, match.index))
      buffer = buffer.slice(match.index + match[0].length)
      match = buffer.match(/\r?\n\r?\n/)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) flushEvent(buffer)

  return {
    content,
    reasoning_content: reasoningContent || undefined,
    tool_calls: [...toolCallParts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: call.id || generateId(),
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      }))
      .filter((call) => call.function.name),
    finish_reason: finishReason,
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: '工具返回值无法序列化。' })
  }
}

function toolErrorContent(message: string): string {
  return JSON.stringify({ ok: false, error: message })
}

async function executeDeepSeekToolCall(params: {
  call: DeepSeekToolCall
  tools: ToolSet | undefined
  messages: ModelMessage[]
  abortSignal?: AbortSignal
  toolCallbacks?: ToolCallbacks
  stepNumber: number
}): Promise<string> {
  const { call, tools, messages, abortSignal, toolCallbacks, stepNumber } = params
  const toolName = call.function.name
  const toolCallId = call.id
  const tool = tools?.[toolName]
  let input: unknown = {}

  try {
    input = call.function.arguments?.trim() ? JSON.parse(call.function.arguments) : {}
  } catch (error) {
    toolCallbacks?.onToolCallStart?.({ toolName, toolCallId, input: call.function.arguments })
    toolCallbacks?.onToolCallFinish?.({ toolName, toolCallId, output: undefined, error, durationMs: 0 })
    return toolErrorContent(`工具参数不是合法 JSON：${(error as Error).message}`)
  }

  toolCallbacks?.onToolCallStart?.({ toolName, toolCallId, input })
  const start = Date.now()

  if (!tool?.execute) {
    const error = new Error(`工具 ${toolName} 未注册或不可执行。`)
    toolCallbacks?.onToolCallFinish?.({ toolName, toolCallId, output: undefined, error, durationMs: Date.now() - start })
    return toolErrorContent(error.message)
  }

  const validation = await safeValidateTypes({
    value: input,
    schema: tool.inputSchema,
    context: { entityName: 'tool input', entityId: toolName },
  })

  if (!validation.success) {
    toolCallbacks?.onToolCallFinish?.({ toolName, toolCallId, output: undefined, error: validation.error, durationMs: Date.now() - start })
    return toolErrorContent(`工具参数校验失败：${validation.error.message}`)
  }

  try {
    let output: unknown
    const stream = executeTool({
      execute: tool.execute.bind(tool),
      input: validation.value,
      options: {
        toolCallId,
        messages,
        abortSignal,
        experimental_context: { stepNumber },
      },
    })

    for await (const part of stream) {
      if (part.type === 'final') output = part.output
    }

    toolCallbacks?.onToolCallFinish?.({ toolName, toolCallId, output, durationMs: Date.now() - start })
    return safeJsonStringify(output)
  } catch (error) {
    toolCallbacks?.onToolCallFinish?.({ toolName, toolCallId, output: undefined, error, durationMs: Date.now() - start })
    return toolErrorContent((error as Error).message)
  }
}

async function* emptyTextStream(): AsyncIterable<string> {
  yield* []
}

export async function streamDeepSeekToolChat(params: {
  profile: ModelProfile
  baseURL: string
  system?: string
  messages: ModelMessage[]
  tools?: ToolSet
  maxSteps?: number
  thinkingEnabled: boolean
  maxOutputTokens: number
  abortSignal?: AbortSignal
  toolCallbacks?: ToolCallbacks
}): Promise<DeepSeekToolChatResult> {
  const {
    profile,
    baseURL,
    system,
    messages,
    tools,
    maxSteps = 8,
    thinkingEnabled,
    maxOutputTokens,
    abortSignal,
    toolCallbacks,
  } = params
  const deepSeekTools = await toDeepSeekTools(tools)
  const requestMessages = toDeepSeekMessages(system, messages)
  let visibleText = ''
  let finishReason: FinishReason = 'other'
  let rawFinishReason: string | undefined

  const emitTextDelta = (delta: string) => {
    if (!delta) return
    visibleText += delta
    toolCallbacks?.onTextDelta?.(delta)
  }

  for (let stepNumber = 0; stepNumber < maxSteps; stepNumber += 1) {
    if (abortSignal?.aborted) throw new Error('用户已停止任务。')

    const message = await streamDeepSeekChatCompletion({
      profile,
      baseURL,
      messages: requestMessages,
      tools: deepSeekTools,
      thinkingEnabled,
      maxOutputTokens,
      abortSignal,
      onContentDelta: emitTextDelta,
    })
    const toolCalls = message.tool_calls.map((call) => ({ ...call, id: call.id || generateId() }))
    const text = message.content
    rawFinishReason = message.finish_reason ?? undefined
    finishReason = mapFinishReason(message.finish_reason)

    toolCallbacks?.onStepFinish?.({
      stepNumber,
      text,
      toolCalls,
      finishReason: rawFinishReason ?? finishReason,
    })

    if (!toolCalls.length) {
      break
    }

    if (text.trim()) emitTextDelta('\n\n')

    requestMessages.push(removeUndefined({
      role: 'assistant' as const,
      content: message.content || null,
      reasoning_content: message.reasoning_content,
      tool_calls: toolCalls,
    }))

    for (const call of toolCalls) {
      const content = await executeDeepSeekToolCall({ call, tools, messages, abortSignal, toolCallbacks, stepNumber })
      requestMessages.push({ role: 'tool', tool_call_id: call.id, content })
    }
  }

  return {
    textStream: emptyTextStream(),
    text: Promise.resolve(visibleText.trim()),
    finishReason: Promise.resolve(finishReason),
    rawFinishReason: Promise.resolve(rawFinishReason),
  }
}
