import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateText, stepCountIs } from 'ai'
import { streamDeepSeekToolChat, type DeepSeekToolChatResult } from './deepseekToolChat'
import type { FinishReason, ModelMessage, ToolSet } from 'ai'
import type { ModelProfile } from './config'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

function getOpenAICompatibleBaseURL(profile: ModelProfile): string {
  const baseURL = profile.baseURL?.trim()
  if (profile.provider === 'deepseek') return baseURL || DEEPSEEK_BASE_URL
  return baseURL
}

function validateProfileApiKey(profile: ModelProfile): string | null {
  const apiKey = profile.apiKey.trim()
  if (!apiKey) return '请填写 API Key'
  if (profile.provider === 'deepseek' && !/^sk-[0-9a-f]{32}$/i.test(apiKey)) {
    return 'DeepSeek API Key 格式不正确：应为 sk- 开头后接 32 位字符，请检查是否多复制或少复制。'
  }
  return null
}

export function supportsToolCalling(_profile: Pick<ModelProfile, 'provider' | 'model'>): boolean {
  return true
}

export interface StreamChatResult {
  textStream: AsyncIterable<string>
  text: PromiseLike<string>
  finishReason: PromiseLike<FinishReason>
  rawFinishReason: PromiseLike<string | undefined>
}

export function createModel(profile: ModelProfile) {
  const apiKey = profile.apiKey.trim()
  if (profile.provider === 'google') {
    const google = createGoogleGenerativeAI({
      apiKey,
      ...(profile.baseURL ? { baseURL: profile.baseURL } : {}),
      headers: profile.headers,
    })
    return google(profile.model)
  }
  // DeepSeek/OpenAI 兼容：使用 .chat() 调用 /chat/completions（v3 默认 /responses 不被第三方支持）
  const baseURL = getOpenAICompatibleBaseURL(profile)
  const openai = createOpenAI({
    baseURL,
    apiKey,
    headers: profile.headers,
  })
  return openai.chat(profile.model)
}

/** Tool 调用生命周期回调 */
export interface ToolCallbacks {
  onTextDelta?: (delta: string) => void
  onToolCallStart?: (info: { toolName: string; toolCallId: string; input: unknown }) => void
  onToolCallFinish?: (info: { toolName: string; toolCallId: string; output: unknown; error?: unknown; durationMs: number }) => void
  onStepFinish?: (info: { stepNumber: number; text: string; toolCalls: unknown[]; finishReason: string }) => void
}

/**
 * 流式聊天 — 支持 tool calling 和多步推理
 *
 * 参考: Vercel AI SDK v6 streamText + stopWhen + tool lifecycle callbacks
 * - tools: 传入完整的工具集
 * - maxSteps: 最大步数（每次 tool call + result 算一步）
 * - 支持 onToolCallStart/Finish 回调用于 UI 反馈
 */
export async function streamChat(
  profile: ModelProfile,
  messages: ModelMessage[],
  options?: {
    system?: string
    tools?: ToolSet
    maxSteps?: number
    abortSignal?: AbortSignal
    toolCallbacks?: ToolCallbacks
  }
): Promise<StreamChatResult | DeepSeekToolChatResult> {
  const { system, tools, maxSteps = 8, abortSignal, toolCallbacks } = options ?? {}

  if (profile.provider === 'deepseek' && tools) {
    return streamDeepSeekToolChat({
      profile,
      baseURL: getOpenAICompatibleBaseURL(profile),
      system,
      messages,
      tools,
      maxSteps,
      abortSignal,
      toolCallbacks,
    })
  }

  const model = createModel(profile)

  const result = streamText({
    model,
    system,
    messages,
    temperature: profile.temperature,
    maxOutputTokens: profile.maxTokens,
    abortSignal,
    // Tool calling 配置
    ...(tools ? { tools, stopWhen: stepCountIs(maxSteps) } : {}),
    // 生命周期回调
    ...(toolCallbacks?.onToolCallStart
      ? {
          experimental_onToolCallStart: (event) => {
            toolCallbacks.onToolCallStart!({
              toolName: event.toolCall.toolName,
              toolCallId: event.toolCall.toolCallId,
              input: event.toolCall.input,
            })
          },
        }
      : {}),
    ...(toolCallbacks?.onToolCallFinish
      ? {
          experimental_onToolCallFinish: (event) => {
            toolCallbacks.onToolCallFinish!({
              toolName: event.toolCall.toolName,
              toolCallId: event.toolCall.toolCallId,
              output: event.success ? event.output : undefined,
              error: event.success ? undefined : event.error,
              durationMs: event.durationMs,
            })
          },
        }
      : {}),
    ...(toolCallbacks?.onStepFinish
      ? {
          onStepFinish: ({ stepNumber, text, toolCalls, finishReason }) => {
            toolCallbacks.onStepFinish!({ stepNumber, text, toolCalls, finishReason })
          },
        }
      : {}),
  })

  return result
}

/** 非流式测试连接 */
export async function testConnection(profile: ModelProfile): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKeyError = validateProfileApiKey(profile)
    if (apiKeyError) return { ok: false, error: apiKeyError }

    const model = createModel(profile)
    await generateText({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      maxOutputTokens: 10,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 列出 profile 对应服务的可用模型列表 */
export async function listModels(profile: ModelProfile): Promise<{ models: string[]; error?: string }> {
  try {
    const apiKeyError = validateProfileApiKey(profile)
    if (apiKeyError) return { models: [], error: apiKeyError }

    if (profile.provider === 'google') {
      const baseURL = profile.baseURL || 'https://generativelanguage.googleapis.com/v1beta'
      const url = `${baseURL}/models?key=${profile.apiKey}`
      const res = await fetch(url)
      if (!res.ok) return { models: [], error: `HTTP ${res.status}` }
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      const models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''))
        .sort()
      return { models }
    }
    // OpenAI-compatible / DeepSeek
    const baseURL = getOpenAICompatibleBaseURL(profile).replace(/\/$/, '')
    const modelListURLs = profile.provider === 'deepseek'
      ? Array.from(new Set([
          `${baseURL}/models`,
          `${baseURL.replace(/\/v1$/, '')}/v1/models`,
        ]))
      : [`${baseURL}/models`]

    let lastError = ''
    for (const url of modelListURLs) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${profile.apiKey.trim()}`,
          ...profile.headers,
        },
      })
      if (!res.ok) {
        lastError = `HTTP ${res.status}`
        continue
      }
      const data = await res.json() as { data?: { id: string }[] }
      const models = (data.data ?? []).map((m) => m.id).sort()
      return { models }
    }
    return { models: [], error: lastError || '获取模型列表失败' }
  } catch (e) {
    return { models: [], error: (e as Error).message }
  }
}
