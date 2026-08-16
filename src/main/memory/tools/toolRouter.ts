import type { ChatProject } from '@shared/types'
import {
  TOOL_MANIFEST,
  getToolNamesByCategory,
  type RegisteredToolName,
} from '@shared/tool-manifest'

export const REGISTERED_TOOL_NAMES = TOOL_MANIFEST.map((entry) => entry.name)
export type { RegisteredToolName } from '@shared/tool-manifest'

const BASE_COMPANION_TOOL_NAMES = [
  ...getToolNamesByCategory('companion'),
  ...getToolNamesByCategory('memory'),
] satisfies readonly RegisteredToolName[]

const WIDGET_TOOL_NAMES = getToolNamesByCategory('widget')

const DESKTOP_SCENE_TOOL_NAMES = getToolNamesByCategory('desktop-scene')

const WORKSPACE_READ_TOOL_NAMES = getToolNamesByCategory('workspace-read')

const WORKSPACE_WRITE_TOOL_NAMES = getToolNamesByCategory('workspace-write')

const DOCUMENT_TOOL_NAMES = getToolNamesByCategory('document')

const COMMAND_TOOL_NAMES = getToolNamesByCategory('command')

export const AGENT_RUN_TOOL_NAMES = TOOL_MANIFEST
  .filter((entry) => entry.tracksAgentRun)
  .map((entry) => entry.name)

export interface ToolRouteDecision {
  toolNames: RegisteredToolName[]
  usesWidgets: boolean
  usesDesktopScene: boolean
  usesWorkspaceRead: boolean
  usesWorkspaceWrite: boolean
  usesDocuments: boolean
  usesCommand: boolean
}

export function isRegisteredToolName(name: string): name is RegisteredToolName {
  return (REGISTERED_TOOL_NAMES as readonly string[]).includes(name)
}

function includesAny(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0
  return pattern.test(text)
}

function isWidgetIntent(text: string): boolean {
  return includesAny(text, /组件|小组件|挂件|桌面组件|桌面文字|便签|贴纸|待办|任务|周记|周总结|提醒|天气卡片|天气组件|日历组件|时钟组件|白噪音|快捷工具|桌宠|萌宠|股票|行情|自选股|看盘|清单|倒计时|进度卡|目标卡|信息卡|仪表盘|放到桌面|加到桌面|摆到桌面|调整.*桌面|改.*组件/i)
}

function isDesktopSceneIntent(text: string): boolean {
  return includesAny(text, /布置桌面|整理桌面|美化桌面|桌面编排|桌面方案|桌面布局|场景模式|专注模式|极简模式|音乐氛围|音乐模式|夜间模式|休息模式|工作模式|资讯模式|看盘模式|桌面.*好看|壁纸.*组件|不要挡住|不挡壁纸|应用.*草案|应用.*方案|确认应用|就按这个|就这样|回滚.*桌面|撤回.*桌面|恢复.*布局|还原.*桌面/i)
}

function isDocumentIntent(text: string): boolean {
  return includesAny(text, /pdf|docx|xlsx|excel|word|表格|文档|OCR|图片文字|识别图片/i)
}

function isCommandIntent(text: string): boolean {
  return includesAny(text, /运行|执行|命令|脚本|测试|构建|启动|npm|pnpm|yarn|python|node|typecheck|lint|build/i)
}

function isProblemInspectionIntent(text: string): boolean {
  return includesAny(text, /(检查|定位|排查|看看|查一下).*(工具|问题|失败|报错|错误|bug|为什么)|为什么.*(失败|报错|错误)|调试|修复|修一下|改一下/i)
}

function isWorkspaceWriteIntent(text: string): boolean {
  if (isWidgetIntent(text)) return false
  return includesAny(text, /创建文件|新建文件|写入|写到|保存到|存成|导出|输出到|修改文件|改写|替换|删除|移动|重命名|整理文件|归类文件|生成报告|生成文档|生成表格|生成HTML|生成JSON|修复|修一下|改一下/i)
}

function isWorkspaceReadIntent(text: string): boolean {
  if (isWidgetIntent(text)) return false
  return includesAny(text, /文件|文件夹|目录|项目|代码|工具|读取|查看|查找|搜索|分析|总结|检查|定位|排查|失败|报错|错误|bug|pdf|docx|xlsx|excel|word/i)
}

function addTools(target: Set<RegisteredToolName>, names: readonly RegisteredToolName[]): void {
  for (const name of names) target.add(name)
}

export function decideToolRoute(params: { text: string; workspace?: ChatProject | null }): ToolRouteDecision {
  const text = params.text ?? ''
  const hasWorkspace = Boolean(params.workspace?.rootPath ?? params.workspace?.path)
  const usesDesktopScene = isDesktopSceneIntent(text)
  const usesWidgets = isWidgetIntent(text) || usesDesktopScene
  const usesDocuments = isDocumentIntent(text)
  const usesProblemInspection = isProblemInspectionIntent(text)
  const usesCommand = isCommandIntent(text) && hasWorkspace
  const usesWorkspaceWrite = (isWorkspaceWriteIntent(text) || /修复|修一下|改一下|调试/.test(text)) && hasWorkspace
  const usesWorkspaceRead = (isWorkspaceReadIntent(text) || usesProblemInspection || usesWorkspaceWrite || usesCommand || usesDocuments) && hasWorkspace

  const selected = new Set<RegisteredToolName>()
  addTools(selected, BASE_COMPANION_TOOL_NAMES)

  if (usesWidgets) addTools(selected, WIDGET_TOOL_NAMES)
  if (usesDesktopScene) addTools(selected, DESKTOP_SCENE_TOOL_NAMES)
  if (usesWorkspaceRead) addTools(selected, WORKSPACE_READ_TOOL_NAMES)
  if (usesWorkspaceWrite) addTools(selected, WORKSPACE_WRITE_TOOL_NAMES)
  if (usesDocuments) addTools(selected, DOCUMENT_TOOL_NAMES)
  if (usesCommand) addTools(selected, COMMAND_TOOL_NAMES)

  return {
    toolNames: [...selected],
    usesWidgets,
    usesDesktopScene,
    usesWorkspaceRead,
    usesWorkspaceWrite,
    usesDocuments,
    usesCommand,
  }
}

function toolList(names: readonly string[]): string {
  return names.map((name) => `- ${name}`).join('\n')
}

export function buildToolRouterPrompt(params: { workspace?: ChatProject | null; route: ToolRouteDecision }): string {
  const { workspace, route } = params
  const rootPath = workspace?.rootPath ?? workspace?.path
  const workspaceName = workspace?.displayName ?? workspace?.name ?? '未选择'
  const blocks: string[] = [
    `【本轮可用能力】\n你可以在需要真实信息或真实操作时使用工具。不要暴露内部工具名；对用户只说自然的进展，比如“我看一下”“我帮你放上去”“我翻一下相关文件”。\n\n当前启用的工具：\n${toolList(route.toolNames)}`,
    `【轻量电脑操作】\n天气、新闻、搜索、时间、计算、位置、剪贴板、打开网页、系统信息和记忆属于日常辅助能力。能直接回答就直接回答；涉及实时信息或真实系统状态时再使用工具。工具前后尽量用一句短的、符合人设的话过渡。`,
  ]

  if (route.usesWidgets) {
    blocks.push(`【桌面组件操作】\n用户要求添加、查看、调整或移除桌面组件时，优先使用组件工具完成真实操作。组件操作是轻量桌面陪伴能力，不要把它说成文件任务、项目任务或工作区任务。\n内置组件类型包括：clock、elegantclock、pixelclock、graphicdatetime、audio、weather、whitenoise、text、todo-board、stocks、news、calendar、quicktools、pet、sysmonitor、desktop-icons-box、desktop-icons-horizontal、desktop-icons-adaptive、desktop-icons-dock。\n用户说待办、任务、完成某件事、删除某条任务或周总结时，使用 manage_todo_tasks 操作 todo-board 中的真实任务；修改、完成和删除前先 list 获取准确 taskId，禁止猜测。纯文字便签才用 text。实时股票、天气、新闻必须使用对应内置组件，绝不能用生成式组件编造静态数据。创建 stocks 时把用户指定的六位 A 股代码放进 stockSymbols；用户没说具体股票时只问一次名称或代码，不要先创建空卡片。只有不属于任务便笺的个性化进度、倒计时、组合静态信息卡才调用 create_generated_widget。`)
  }

  if (route.usesDesktopScene) {
    blocks.push(`【AI 桌面编排】\n用户要求“布置桌面、极简模式、夜间专注、音乐氛围、桌面更好看、不挡壁纸”等整桌调整时，先读取当前桌面和组件能力，再用只读预览生成确定性布局和美学检查结果，然后给出场景草案。桌面编排的第一原则是美观和克制：保留 Dock，不清空图标，不默认删除组件，不默认铺满新闻/股票/系统监控；默认最多一个主视觉组件和两三个轻组件。只有在用户明确确认“应用/就按这个/确认应用”后，才调用桌面编排应用工具；应用前会自动创建快照，用户不喜欢时用回滚工具恢复。用户只是要单个轻组件时，可用普通组件工具完成。`)
  }

  if (route.usesWorkspaceRead || route.usesWorkspaceWrite || route.usesDocuments || route.usesCommand) {
    blocks.push(`【当前本地文件夹】\n名称：${workspaceName}\n路径：${rootPath ?? '未选择'}\n只有用户明确要求你查看、分析、整理、生成或修改本地文件时，才使用本地文件相关工具。文件工具只能接收当前文件夹内的相对路径。`)
  }

  if (route.usesWorkspaceRead) {
    blocks.push(`【读取本地文件】\n查看、总结、搜索、理解本地文件，或用户要求检查工具失败/报错原因时，先用 list_directory、search_text、read_file 或 get_file_info 获取真实上下文，不要凭空猜测文件内容。`)
  }

  if (route.usesWorkspaceWrite) {
    blocks.push(`【修改本地文件】\n创建、修改、移动、删除、生成本地文件，或用户明确要求修复问题时，必须通过写入工具完成；工具返回 ok=true 才能说已经完成。涉及已有文件变更时，按工具要求创建 checkpoint 和等待确认。完成后用 verify_workspace_result 检查结果。`)
  }

  if (route.usesDocuments) {
    blocks.push(`【文档/表格/图片文字】\n处理 PDF、Word、Excel 或图片文字时，使用对应文档工具。生成 DOCX/XLSX 时只在用户明确要文件结果时使用。`)
  }

  if (route.usesCommand) {
    blocks.push(`【运行命令】\n只有用户明确要求运行命令、脚本、测试或构建时才使用 run_command。不要声称已经执行未获批准或未返回结果的命令。`)
  }

  return blocks.join('\n\n')
}
