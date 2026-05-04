import type { ChatProject } from '@shared/types'

export const REGISTERED_TOOL_NAMES = [
  'get_current_time',
  'calculator',
  'web_search',
  'read_clipboard',
  'write_clipboard',
  'open_url',
  'get_system_info',
  'memory_store',
  'memory_recall',
  'weather',
  'news',
  'list_directory',
  'read_file',
  'search_text',
  'get_file_info',
  'create_checkpoint',
  'restore_checkpoint',
  'compare_file_versions',
  'create_file',
  'patch_file',
  'write_file',
  'create_directory',
  'copy_path',
  'move_path',
  'delete_to_trash',
  'restore_from_trash',
  'generate_artifact',
  'verify_workspace_result',
  'run_command',
  'extract_pdf_text',
  'read_docx',
  'write_docx',
  'read_xlsx',
  'write_xlsx',
  'ocr_image',
] as const

export type RegisteredToolName = typeof REGISTERED_TOOL_NAMES[number]

export function isRegisteredToolName(name: string): name is RegisteredToolName {
  return (REGISTERED_TOOL_NAMES as readonly string[]).includes(name)
}

export function buildToolRouterPrompt(params: { workspace?: ChatProject | null }): string {
  const hasWorkspace = Boolean(params.workspace?.rootPath ?? params.workspace?.path)
  const workspaceName = params.workspace?.displayName ?? params.workspace?.name ?? '未选择'
  const permissionProfile = params.workspace?.permissionProfile ?? 'ask-before-editing'
  const permissionText = permissionProfile === 'workspace-write'
    ? '工作区写入：普通创建、修改、移动和产物生成可直接执行；删除和命令仍可能需要确认。'
    : permissionProfile === 'full-access'
      ? '完整访问：多数文件操作可直接执行；命令仍可能需要确认。'
      : permissionProfile === 'read-only'
        ? '只读：不要尝试写入文件。'
        : '自动审查：写入或高风险操作可能需要确认。'

  return `【Tool Router 规则】
你只能通过已注册工具完成真实操作，不能声称自己调用了不存在的工具。

已注册工具：
- 时间/计算/联网：get_current_time, calculator, weather, news, web_search, open_url
- 系统和剪贴板：get_system_info, read_clipboard, write_clipboard
- 记忆：memory_store, memory_recall
- Workspace 只读文件：list_directory, read_file, search_text, get_file_info
- Checkpoint：create_checkpoint, restore_checkpoint, compare_file_versions
- Workspace 写入变更：create_file, patch_file, write_file, create_directory, copy_path, move_path, delete_to_trash, restore_from_trash
- Artifact：generate_artifact
- Verification：verify_workspace_result
- Command：run_command
- 文档表格图片：extract_pdf_text, read_docx, write_docx, read_xlsx, write_xlsx, ocr_image

路径规则：
- 当前 Workspace：${workspaceName}
- Workspace 状态：${hasWorkspace ? '已选择，可以使用只读文件工具' : '未选择，不能读取本地项目文件'}
- 当前权限：${permissionText}
- 文件工具只接受 Workspace 相对路径；不要传入外部绝对路径。
- 读取文件前优先用 list_directory 或 search_text 定位候选文件。
- 读取敏感文件、Workspace 外路径或符号链接跳出路径会被 Permission Engine 阻止。

能力边界：
- 当前已实现只读文件工具、checkpoint 工具和审批保护的 Workspace 写入工具。
- 使用工具前后可以输出一句符合人设的简短过程话，让用户知道你在做什么；这些话会被 UI 折叠进过程区，最终回复不要重复这些过程。
- 当用户要求生成报告、汇总文档、CSV、HTML、JSON 等可交付结果时，优先使用 generate_artifact，而不是普通 write_file。
- 完成创建、修改、移动或生成产物后，使用 verify_workspace_result 验证结果，再总结。
- 用户要求创建、写入或生成文件时，必须调用 create_file、write_file、write_docx、write_xlsx 或 generate_artifact；不要把完整文件内容直接输出到聊天里当作替代。
- 写入型工具返回 ok=true 才代表文件真的创建或修改成功；如果 ok=false、approvalRequired 或没有工具结果，不要声称文件已经创建，也不要把本应写入文件的正文改在聊天里输出。
- 最终回复只给文件路径、摘要和下一步建议；除非用户明确要求预览，不要粘贴长文件正文或长命令输出。
- 写入、移动、删除文件前必须先使用 create_checkpoint 保护受影响文件。
- 写入、删除、移动等工具只有在返回 approvalRequired 时才等待用户批准；如果工具直接返回 ok=true，就继续完成任务。
- 删除只能使用 delete_to_trash，不能永久删除。
- run_command 只能在当前 Workspace 内运行直接命令和参数；如果返回 approvalRequired，必须等待用户批准。不要使用 shell 管道、重定向或内联脚本。
- 处理 PDF/DOCX/XLSX/图片文字时使用对应文档工具；写 DOCX/XLSX 会登记 Artifact 并需要审批。`
}