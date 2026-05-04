import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateText, stepCountIs } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import type { ModelProfile } from './config'

export function createModel(profile: ModelProfile) {
  if (profile.provider === 'google') {
    const google = createGoogleGenerativeAI({
      apiKey: profile.apiKey,
      ...(profile.baseURL ? { baseURL: profile.baseURL } : {}),
      headers: profile.headers,
    })
    return google(profile.model)
  }
  // Default: OpenAI-compatible
  const openai = createOpenAI({
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    headers: profile.headers,
  })
  return openai(profile.model)
}

/** Tool 调用生命周期回调 */
export interface ToolCallbacks {
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
): Promise<{ textStream: AsyncIterable<string> }> {
  const model = createModel(profile)
  const { system, tools, maxSteps = 8, abortSignal, toolCallbacks } = options ?? {}

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
    const model = createModel(profile)
    const result = await generateText({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      maxOutputTokens: 10,
    })
    return { ok: !!result.text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 列出 profile 对应服务的可用模型列表 */
export async function listModels(profile: ModelProfile): Promise<{ models: string[]; error?: string }> {
  try {
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
    // OpenAI-compatible
    const url = `${profile.baseURL}/models`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        ...profile.headers,
      },
    })
    if (!res.ok) return { models: [], error: `HTTP ${res.status}` }
    const data = await res.json() as { data?: { id: string }[] }
    const models = (data.data ?? []).map((m) => m.id).sort()
    return { models }
  } catch (e) {
    return { models: [], error: (e as Error).message }
  }
}
