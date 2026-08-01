import type { AgentPlanStep, AgentRunStatus, ChatProject } from '@shared/types'

const READ_KEYWORDS = /查看|读取|搜索|查找|找文件|分析|总结|检查|列出|目录|文件|文档|代码|项目|pdf|docx|xlsx|excel|word/i
const WRITE_KEYWORDS = /修改|改写|创建|生成|写入|写到|保存|存成|存到|导出|输出到|落盘|记录到|删除|移动|重命名|整理|归类|修复|实现|新增|替换|批量/i
const COMMAND_KEYWORDS = /运行|执行|命令|脚本|测试|构建|npm|pnpm|python|node/i
const AGENT_TASK_KEYWORDS = /文件|文件夹|目录|项目|代码|文档|表格|PDF|DOCX|XLSX|Excel|Word|OCR|截图|创建|生成|写入|写到|保存|存成|存到|导出|输出到|落盘|记录到|删除|移动|重命名|整理|归类|修复|实现|新增|替换|批量|运行|执行|命令|脚本|测试|构建|npm|pnpm|python|node/i
const WIDGET_KEYWORDS = /组件|小组件|挂件|桌面组件|桌面文字|便签|贴纸|天气卡片|天气组件|日历组件|时钟组件|白噪音|快捷工具|桌宠|萌宠|放到桌面|加到桌面|摆到桌面|调整.*桌面|改.*组件/i
const LOCAL_AGENT_DOMAIN_KEYWORDS = /文件|文件夹|目录|项目|代码|文档|表格|PDF|DOCX|XLSX|Excel|Word|OCR|截图|保存到|存成|存到|导出|输出到|落盘|记录到|运行|执行|命令|脚本|测试|构建|npm|pnpm|python|node/i
const DEBUG_AGENT_KEYWORDS = /(检查|定位|排查|看看|查一下).*(工具|问题|失败|报错|错误|bug|为什么)|为什么.*(失败|报错|错误)|调试|修复|修一下|改一下/i

function extractExpectedFiles(intent: string): string[] {
  const matches = intent.match(/[^\s"'<>|:*?]+\.(?:ts|tsx|js|jsx|json|md|txt|css|html|py|yml|yaml|csv|xlsx|docx|pdf)/gi)
  if (!matches) return []
  return [...new Set(matches.map((item) => item.replace(/\\/g, '/')))].slice(0, 8)
}

function createStep(params: Omit<AgentPlanStep, 'id'>, index: number): AgentPlanStep {
  return {
    id: `plan-${index + 1}`,
    ...params,
  }
}

export function createAgentRunTitle(params: { intent: string; workspace?: ChatProject | null }): string {
  const { intent, workspace } = params
  const hasWorkspace = Boolean(workspace?.rootPath ?? workspace?.path)
  const expectedFiles = extractExpectedFiles(intent)
  const debugIntent = DEBUG_AGENT_KEYWORDS.test(intent)
  const wantsWrite = WRITE_KEYWORDS.test(intent) || /修复|修一下|改一下|调试/.test(intent)
  const wantsCommand = COMMAND_KEYWORDS.test(intent)
  const wantsRead = READ_KEYWORDS.test(intent) || debugIntent

  if (/整理|归类|分类|收纳/i.test(intent)) return hasWorkspace ? '整理工作区文件' : '整理文件任务'
  if (/创建|生成|写入|新增/i.test(intent)) return hasWorkspace ? '生成工作区文件' : '生成文件任务'
  if (/修改|改写|替换|修复|实现/i.test(intent)) return hasWorkspace ? '修改项目文件' : '修改文件任务'
  if (/删除|移动|重命名/i.test(intent)) return hasWorkspace ? '调整工作区文件' : '调整文件任务'
  if (wantsCommand) return '运行工作区命令'
  if (expectedFiles.length > 0) return expectedFiles.length === 1 ? `处理 ${expectedFiles[0]}` : '处理指定文件'
  if (wantsRead) return hasWorkspace ? '读取项目上下文' : '读取文件上下文'
  if (hasWorkspace) return '处理工作区任务'
  if (wantsWrite) return '执行文件任务'
  return '执行复杂任务'
}

export function createInitialAgentPlan(params: {
  intent: string
  workspace?: ChatProject | null
}): AgentPlanStep[] {
  const { intent, workspace } = params
  const hasWorkspace = Boolean(workspace?.rootPath ?? workspace?.path)
  const expectedFiles = extractExpectedFiles(intent)
  const debugIntent = DEBUG_AGENT_KEYWORDS.test(intent)
  const wantsRead = READ_KEYWORDS.test(intent) || debugIntent
  const wantsWrite = WRITE_KEYWORDS.test(intent) || /修复|修一下|改一下|调试/.test(intent)
  const wantsCommand = COMMAND_KEYWORDS.test(intent)
  const autoWorkspaceWrite = workspace?.permissionProfile === 'workspace-write' || workspace?.permissionProfile === 'full-access'
  const writeStepRequiresApproval = wantsCommand || !autoWorkspaceWrite

  const steps: Omit<AgentPlanStep, 'id'>[] = [
    {
      goal: '理解任务目标和影响范围',
      toolCategory: 'reasoning',
      readOnly: true,
      writesFiles: false,
      requiresApproval: false,
      expectedFiles,
      verification: '确认是否需要读取 Workspace 文件或执行工具',
      status: 'running',
    },
  ]

  if (hasWorkspace && wantsRead) {
    steps.push({
      goal: '定位并读取相关 Workspace 上下文',
      toolCategory: 'workspace-read',
      readOnly: true,
      writesFiles: false,
      requiresApproval: false,
      expectedFiles,
      verification: 'Context Panel 中出现实际读取或搜索到的路径',
      status: 'pending',
    })
  }

  if (wantsWrite) {
    steps.push({
      goal: writeStepRequiresApproval ? '生成变更方案并等待用户审批' : '执行工作区文件变更',
      toolCategory: wantsCommand ? 'command-or-file-write' : 'file-write',
      readOnly: false,
      writesFiles: true,
      requiresApproval: writeStepRequiresApproval,
      expectedFiles,
      verification: writeStepRequiresApproval ? '写入前需要审批、checkpoint 和可审查 diff' : '写入时创建 checkpoint，并记录可审查文件活动',
      status: 'pending',
    })
    steps.push({
      goal: '验证变更结果并汇总风险',
      toolCategory: 'verification',
      readOnly: true,
      writesFiles: false,
      requiresApproval: false,
      expectedFiles,
      verification: wantsCommand ? '检查命令退出码和输出摘要' : '检查目标文件是否存在且内容符合任务',
      status: 'pending',
    })
  } else {
    steps.push({
      goal: '整理上下文并生成回复',
      toolCategory: 'response',
      readOnly: true,
      writesFiles: false,
      requiresApproval: false,
      expectedFiles,
      verification: '回复引用实际工具结果或说明未读取文件的原因',
      status: 'pending',
    })
  }

  return steps.map(createStep)
}

export function shouldCreateAgentRun(params: { intent: string; workspace?: ChatProject | null; force?: boolean }): boolean {
  if (params.force) return true
  const debugIntent = DEBUG_AGENT_KEYWORDS.test(params.intent)
  const widgetOnly = WIDGET_KEYWORDS.test(params.intent) && !debugIntent && !/文件|文件夹|目录|项目|代码|PDF|DOCX|XLSX|Excel|Word|OCR|运行|执行|命令|脚本|测试|构建|npm|pnpm|python|node/i.test(params.intent)
  if (widgetOnly) return false
  const hasWorkspace = Boolean(params.workspace?.rootPath ?? params.workspace?.path)
  const expectedFiles = extractExpectedFiles(params.intent)
  const localAgentIntent = LOCAL_AGENT_DOMAIN_KEYWORDS.test(params.intent) || debugIntent || expectedFiles.length > 0
  const wantsRead = hasWorkspace && (debugIntent || (localAgentIntent && READ_KEYWORDS.test(params.intent)))
  const wantsWrite = localAgentIntent && (WRITE_KEYWORDS.test(params.intent) || /修复|修一下|改一下|调试/.test(params.intent))
  const wantsCommand = COMMAND_KEYWORDS.test(params.intent)
  const namesAgentDomain = localAgentIntent && AGENT_TASK_KEYWORDS.test(params.intent)
  return wantsWrite || wantsCommand || expectedFiles.length > 0 || wantsRead || (hasWorkspace && namesAgentDomain)
}

export function updatePlanForRunStatus(plan: AgentPlanStep[], status: AgentRunStatus): AgentPlanStep[] {
  if (plan.length === 0) return plan

  if (status === 'failed') {
    return plan.map((step) => step.status === 'running' ? { ...step, status: 'failed' } : step)
  }

  if (status === 'cancelled') {
    return plan.map((step) => step.status === 'running' || step.status === 'pending' ? { ...step, status: 'skipped' } : step)
  }

  if (status === 'completed') {
    return plan.map((step) => step.status === 'blocked' ? step : { ...step, status: 'completed' })
  }

  const targetCategoryByStatus: Partial<Record<AgentRunStatus, string[]>> = {
    scoping: ['reasoning'],
    'loading-context': ['workspace-read'],
    planning: ['file-write', 'command-or-file-write'],
    executing: ['workspace-read', 'response', 'file-write', 'command-or-file-write'],
    verifying: ['verification'],
    'waiting-approval': ['file-write', 'command-or-file-write'],
  }
  const targetCategories = targetCategoryByStatus[status]
  if (!targetCategories) return plan

  let activated = false
  return plan.map((step) => {
    if (targetCategories.includes(step.toolCategory) && !activated && step.status !== 'completed') {
      activated = true
      return { ...step, status: status === 'waiting-approval' ? 'blocked' : 'running' }
    }
    if (!activated && step.status === 'running') return { ...step, status: 'completed' }
    return step
  })
}
