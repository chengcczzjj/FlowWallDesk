/**
 * 工具系统 — 导出所有工具定义和注册逻辑
 *
 * 参考实现:
 * - Vercel AI SDK v6 tool() + stopWhen + onStepFinish
 * - OpenAI function calling schema
 * - Claude tool_use 协议
 *
 * 设计原则:
 * - 每个 tool 用 AI SDK 的 tool() helper 定义，自带 Zod schema 校验
 * - 通过 getToolSet() 统一获取当前可用工具集
 * - 支持 onToolCallStart / onToolCallFinish 生命周期回调
 */

export { getToolSet, type ToolCallEvent } from './registry'
export { buildToolRouterPrompt, isRegisteredToolName, REGISTERED_TOOL_NAMES, type RegisteredToolName } from './toolRouter'
