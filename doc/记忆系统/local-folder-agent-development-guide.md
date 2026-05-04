# 本地文件夹 Agent 软件完整设计规格

整理日期：2026-05-03

## 1. 产品定义

产品是一个以本地文件夹为工作边界的桌面 Agent。用户选择一个本地文件夹后，可以通过自然语言让 Agent 完成文件整理、资料总结、代码修改、文档生成、表格处理、批量重命名、脚本运行、结果检查、长期跟进等复杂任务。

核心体验要求：

- 用户始终知道 Agent 当前在哪个文件夹工作。
- 用户始终知道 Agent 正在做什么、下一步要做什么、是否需要自己确认。
- 用户始终能看到 Agent 读取了哪些文件、修改了哪些文件、生成了哪些产物。
- 用户始终能撤销 Agent 对本地文件的关键修改。
- Agent 能准确选择工具、准确传参、准确执行、准确验证。
- 所有高风险动作都有清晰的 UI 提示和审批。

## 2. 核心对象

### Workspace

Workspace 是用户选定的本地文件夹，是 Agent 的默认工作边界。

字段：

- `id`
- `name`
- `rootPath`
- `displayName`
- `permissionProfile`
- `indexStatus`
- `fileStats`
- `ignoreRules`
- `instructions`
- `createdAt`
- `lastOpenedAt`

### Thread

Thread 是围绕某个 Workspace 的一次持续任务会话。

字段：

- `id`
- `workspaceId`
- `title`
- `status`
- `messages`
- `activeRunId`
- `createdAt`
- `updatedAt`

### AgentRun

AgentRun 是一次 Agent 执行过程。

字段：

- `id`
- `threadId`
- `workspaceId`
- `status`
- `intent`
- `plan`
- `contextFiles`
- `toolCalls`
- `approvals`
- `checkpoints`
- `fileChanges`
- `artifacts`
- `verification`
- `summary`
- `startedAt`
- `finishedAt`

### ToolCall

ToolCall 是 Agent Runtime 执行的一个工具动作。

字段：

- `id`
- `runId`
- `toolName`
- `input`
- `inputSummary`
- `output`
- `outputSummary`
- `riskLevel`
- `status`
- `approvalId`
- `startedAt`
- `finishedAt`

### Checkpoint

Checkpoint 是文件修改前的可恢复快照。

字段：

- `id`
- `workspaceId`
- `runId`
- `name`
- `fileBackups`
- `manifest`
- `createdAt`

### FileChange

FileChange 是 Agent 对文件系统造成的可审查变更。

字段：

- `id`
- `runId`
- `type`
- `path`
- `oldPath`
- `backupPath`
- `diff`
- `reason`
- `toolCallId`
- `reviewState`
- `createdAt`

### Artifact

Artifact 是 Agent 生成的结果文件或可预览产物。

字段：

- `id`
- `runId`
- `name`
- `path`
- `type`
- `previewType`
- `sourceFiles`
- `createdAt`

## 3. 本地文件夹能力

### Workspace 打开与识别

打开文件夹后，系统立刻完成一次轻量扫描：

- 识别文件夹名称。
- 识别完整绝对路径。
- 统计文件数量、目录数量、总大小。
- 识别主要文件类型。
- 识别常见项目文件，如 `package.json`、`pyproject.toml`、`requirements.txt`、`README.md`。
- 识别说明文件，如 `AGENTS.md`、`README.md`、`.local-agent/rules.md`。
- 识别敏感文件，如 `.env`、`.pem`、`.key`、credential、token。
- 识别大目录，如 `node_modules`、`dist`、`build`、`coverage`。
- 生成 Workspace 摘要，用于线程启动上下文。

### Workspace 索引

索引需要支持：

- 文件名检索。
- 文本检索。
- 文件类型筛选。
- 最近修改筛选。
- 大文件标记。
- 敏感文件标记。
- 忽略规则。
- 摘要缓存。

索引状态需要显示：

- `Not indexed`
- `Indexing`
- `Ready`
- `Partially indexed`
- `Index failed`

### 文件工具

必须提供这些工具：

- `list_directory`
- `read_file`
- `search_text`
- `get_file_info`
- `create_file`
- `patch_file`
- `write_file`
- `create_directory`
- `copy_path`
- `move_path`
- `delete_to_trash`
- `restore_from_trash`
- `create_checkpoint`
- `restore_checkpoint`
- `compare_file_versions`
- `preview_file`

复杂任务工具：

- `run_command`
- `extract_pdf_text`
- `read_docx`
- `write_docx`
- `read_xlsx`
- `write_xlsx`
- `ocr_image`
- `summarize_media`
- `open_local_preview`
- `generate_artifact`

### 文件变更规则

每次写入文件前必须创建 checkpoint。

文件变更记录必须包含：

- 变更类型。
- 变更原因。
- 原路径和新路径。
- 关联 tool call。
- 关联用户任务。
- 可读 diff。
- 恢复入口。

删除文件必须进入应用内回收区。

批量移动、批量重命名、批量删除、覆盖写入、大文件修改都必须先展示预览。

### Checkpoint 与恢复

Checkpoint 需要支持：

- 恢复单个文件。
- 恢复某个 tool call。
- 恢复整个 AgentRun。
- 对比恢复前后内容。
- 检测用户后续手动修改。
- 冲突时展示冲突文件和恢复策略。

恢复 UI 文案使用：

- `Restore this file`
- `Undo this change`
- `Restore checkpoint`
- `Compare before restore`

## 4. Workspace 文件夹在 UI 中的显示与隐藏规则

### 全局显示原则

- 默认显示 Workspace 名称。
- 常规 UI 使用 workspace-relative path。
- 完整绝对路径放在详情、tooltip、展开区域或设置页。
- 涉及权限、安全、外部路径、恢复、错误时显示完整路径。
- Toast 和系统通知只显示 Workspace 名称和相对路径。
- 分享摘要、复制总结、导出报告时默认隐藏用户本机绝对路径。

### 打开 Workspace 后的提示

显示：

```text
Working folder
Marketing Docs

Agent can read and edit files inside this folder.
Full path: D:\Work\Marketing Docs
```

同时显示：

- 文件数量。
- 主要文件类型。
- 是否检测到规则文件。
- 是否检测到敏感文件。
- 当前权限模式。

### Workspace 切换入口

显示：

- Workspace 名称。
- 父级路径简写。
- 最近打开时间。
- 当前状态。

示例：

```text
Marketing Docs
D:\Work
Ready · 1,284 files
```

隐藏：

- 绝对路径中间部分默认折叠。
- 宽度不足时只显示 Workspace 名称。
- 鼠标悬停、点击详情或设置页显示完整路径。

### Thread 标题区域

显示：

- Workspace 名称。
- 当前线程标题。
- AgentRun 状态。
- 当前权限 chip。

示例：

```text
Marketing Docs · Organize Q1 reports
Running · Workspace write · Checkpoint ready
```

隐藏：

- 默认隐藏完整绝对路径。
- 点击 Workspace chip 后显示完整路径、索引状态和权限详情。

### Composer 输入区

显示：

```text
Working in: Marketing Docs
Access: Ask before risky actions
```

当用户输入涉及文件夹外路径时，显示：

```text
External path detected
Agent needs approval before reading or writing outside Marketing Docs.
```

当用户拖入文件时：

- Workspace 内文件显示相对路径。
- Workspace 外文件显示 `External file` 标记。
- 外部文件只作为附件读取，写回原位置需要审批。

### 运行中状态卡

显示：

- 当前动作。
- 使用的 Workspace 名称。
- 正在读取或修改的相对路径。
- 进度数字。

示例：

```text
Reading files in Marketing Docs
Opened 5 relevant files. Scanned 42 filenames.
```

隐藏：

- 默认隐藏工具原始输入。
- 默认隐藏完整绝对路径。
- 展开 `Details` 后显示完整 tool call 和绝对路径。

### Context 文件列表

显示：

- Agent 已读取的文件。
- Agent 只扫描但未读取的文件。
- Agent 跳过的文件。
- 跳过原因。

文件路径显示为相对路径：

```text
reports/q1-summary.md
data/sales.csv
```

敏感文件显示：

```text
.env
Sensitive file · filename only · content not read
```

### Approval 弹窗

显示完整影响范围：

```text
Agent wants to modify files in:
D:\Work\Marketing Docs

Affected files:
reports/q1-summary.md
reports/q2-summary.md
```

如果涉及 Workspace 外部路径，必须突出显示：

```text
Outside workspace
C:\Users\name\Desktop\source.xlsx
```

### Changes 面板

显示：

- Created。
- Modified。
- Moved。
- Copied。
- Deleted to trash。
- Restored。

路径默认使用相对路径。

每个文件项显示：

- 文件名。
- 相对路径。
- 变更类型。
- 变更原因。
- 打开。
- 对比。
- 恢复。

完整路径放在 `File details` 中。

### Artifact 预览

显示：

- 产物名称。
- Workspace 相对路径。
- 来源文件。
- 生成时间。

示例：

```text
summary.xlsx
Generated in outputs/summary.xlsx
Based on 12 source files
```

### Logs

默认显示摘要：

```text
patch_file completed
Modified reports/q1-summary.md
```

展开后显示：

- tool name。
- normalized input。
- resolved absolute path。
- permission decision。
- raw output。
- duration。

### Toast 与通知

Toast 显示短路径：

```text
Checkpoint created
Marketing Docs · 4 files protected
```

系统通知显示：

```text
Agent finished organizing Marketing Docs
Review 42 file changes.
```

## 5. Agent 工作时的 UI 提示

### 状态提示必须包含的信息

每个状态提示都包含：

- 状态名称。
- 当前动作。
- 为什么执行这个动作。
- 使用了哪些文件或工具。
- 用户可以做什么。
- 是否可取消。

### Idle

```text
Ready
Ask Agent to work with files in Marketing Docs.
```

显示操作：

- `New task`
- `Attach file`
- `Choose skill`
- `Change access`

### Scoping

```text
Understanding request
Agent is identifying the goal, affected files, and required tools.
```

显示：

- 正在解析用户意图。
- 当前 Workspace。
- 是否需要补充信息。

### Loading Context

```text
Reading workspace context
Agent scanned 42 filenames and opened 5 relevant files.
```

显示：

- 扫描文件数。
- 打开文件数。
- 跳过文件数。
- 跳过原因入口。

### Planning

```text
Plan ready
Agent will organize files, create a checkpoint, preview changes, then wait for approval before moving files.
```

计划卡需要显示：

- 步骤列表。
- 每一步的工具类型。
- 是否会修改文件。
- 是否需要审批。
- 预计影响文件数量。

计划卡操作：

- `Approve plan`
- `Edit instruction`
- `Run first step`
- `Cancel`

### Checkpointing

```text
Creating checkpoint
Agent is saving current versions before editing 6 files.
```

显示：

- checkpoint 名称。
- 受保护文件数量。
- 可恢复说明。

### Reading Files

```text
Reading files
Agent opened reports/q1-summary.md and data/sales.csv to prepare the next step.
```

显示：

- 当前读取文件。
- 读取目的。
- 读取是否包含敏感内容。

### Preparing Changes

```text
Preparing changes
Agent generated a preview and has not written files yet.
```

显示：

- 预计创建文件数。
- 预计修改文件数。
- 预计移动文件数。
- 预计删除文件数。

操作：

- `Preview changes`
- `Allow writing`
- `Adjust request`

### Waiting Approval

```text
Approval required
Agent needs permission before modifying 18 files.
```

审批卡必须显示：

- 动作类型。
- 影响范围。
- 风险说明。
- 是否已有 checkpoint。
- 拒绝后的替代路径。

按钮：

- `Preview`
- `Allow once`
- `Allow this type in this workspace`
- `Deny`

### Executing Tool

```text
Applying changes
3 of 18 file operations completed.
```

显示：

- 当前工具。
- 当前文件。
- 成功数量。
- 失败数量。
- 可停止按钮。

### Running Command

```text
Running command
python clean_data.py is running in Marketing Docs.
```

显示：

- 命令。
- 工作目录。
- 运行时长。
- 输出摘要。
- 停止按钮。

命令完成后：

```text
Command finished
Exit code 0. Generated outputs/cleaned.csv.
```

命令失败后：

```text
Command failed
Exit code 1. Agent is reading the error output and related files.
```

### Verifying

```text
Verifying result
Agent is checking that all moved files still exist and links are updated.
```

显示：

- 验证项。
- 通过数量。
- 失败数量。
- 未验证项。

### Needs User Input

```text
Need your input
Agent found two possible naming schemes and needs you to choose one.
```

显示：

- 简短问题。
- 2 到 4 个可选项。
- 推荐项。
- 自定义输入。

### Review Ready

```text
Changes ready for review
Created 2 files, modified 4 files, moved 36 files.
```

显示：

- 文件变更统计。
- checkpoint。
- 产物。
- 验证结果。
- 下一步建议。

操作：

- `Review changes`
- `Restore checkpoint`
- `Continue refining`
- `Mark done`

### Done

```text
Done
Agent completed the task and verified the result.
```

完成卡必须包含：

- 完成内容。
- 修改文件统计。
- 生成产物。
- 验证结果。
- 残余风险。
- 可执行下一步。

### Failed

```text
Task failed
Agent could not finish because budget.xlsx is locked by another app.
```

失败卡必须包含：

- 失败步骤。
- 失败原因。
- 已完成动作。
- 已修改文件。
- checkpoint 状态。
- 恢复选项。

操作：

- `Retry`
- `Skip this file`
- `Restore checkpoint`
- `Cancel task`

### Cancelled

```text
Task stopped
Agent stopped after completing 3 of 8 planned steps.
```

显示：

- 已完成步骤。
- 未完成步骤。
- 已修改文件。
- 可恢复 checkpoint。

## 6. UI 提示类型

### Plan Card

Plan Card 展示 Agent 对任务的理解。

必须显示：

- 目标。
- 步骤。
- 需要读取的范围。
- 预计修改的范围。
- 需要审批的节点。
- 验证方式。

### Tool Event Card

Tool Event Card 展示真实工具执行。

默认显示：

- 工具名称的自然语言描述。
- 文件或命令摘要。
- 状态。
- 耗时。

展开显示：

- tool name。
- input。
- output。
- riskLevel。
- approval decision。

### Context Card

Context Card 展示 Agent 用了哪些上下文。

分组：

- Opened files。
- Searched files。
- Skipped files。
- User attachments。
- Generated artifacts。

### Approval Card

Approval Card 是高风险动作的阻断点。

必须显示：

- 需要批准的动作。
- 原因。
- 影响文件。
- 风险。
- checkpoint 状态。
- 选项。

### Checkpoint Card

Checkpoint Card 显示恢复保护。

```text
Checkpoint created
6 files protected before editing.
```

操作：

- `View protected files`
- `Restore`

### Change Summary Card

Change Summary Card 展示本次变更。

```text
File changes
Created 2 · Modified 4 · Moved 36 · Deleted 0
```

### Verification Card

Verification Card 展示验证结果。

```text
Verification
Passed 4 checks · 1 warning
```

### Safety Warning Card

Safety Warning Card 展示敏感文件、外部路径、联网、批量操作。

```text
Sensitive file detected
.env may contain secrets. Agent has not read its contents.
```

## 7. 关键任务的 UI 提示流程

### 整理文件夹

1. 显示 `Understanding request`。
2. 显示 `Scanning folder`。
3. 显示文件类型统计。
4. 显示整理计划。
5. 显示预计移动文件列表。
6. 创建 checkpoint。
7. 请求用户批准批量移动。
8. 执行移动。
9. 验证文件存在。
10. 显示变更总结和恢复入口。

关键提示：

```text
Agent generated an organization plan.
No files have been moved yet.
```

### 批量重命名

1. 扫描命名模式。
2. 提出命名规则。
3. 显示 old name -> new name 对照表。
4. 创建 checkpoint。
5. 请求批准。
6. 执行 rename。
7. 检查引用是否需要更新。
8. 显示结果。

关键提示：

```text
Preview rename table
Agent will rename 24 files. Review the new names before applying.
```

### 修改文件内容

1. 搜索相关文件。
2. 读取候选文件。
3. 显示将修改的文件。
4. 创建 checkpoint。
5. 应用 patch。
6. 显示 diff。
7. 运行可用验证。
8. 显示完成摘要。

关键提示：

```text
Applying patch
Agent is editing docs/guide.md using a checkpoint-backed patch.
```

### 生成文档或报告

1. 扫描资料。
2. 读取来源文件。
3. 显示引用来源。
4. 生成 artifact。
5. 预览 artifact。
6. 显示输出路径。

关键提示：

```text
Generating report
Agent is creating outputs/summary.docx based on 12 source files.
```

### 运行脚本或命令

1. 识别命令目的。
2. 显示命令和工作目录。
3. 检查风险。
4. 请求批准。
5. 执行命令。
6. 摘要输出。
7. 读取结果文件。
8. 显示验证状态。

关键提示：

```text
Approval required
Agent wants to run a local command in Marketing Docs.
```

## 8. Agent 设计

### Agent 分层

Agent 由这些层组成：

- Model Adapter。
- Prompt Orchestrator。
- Context Builder。
- Planner。
- Tool Router。
- Permission Engine。
- Tool Executor。
- Result Normalizer。
- Verification Engine。
- Event Stream。
- Memory and Instructions。

### Model Adapter

Model Adapter 统一不同模型的输入输出。

支持：

- OpenAI。
- Gemini。
- Claude。
- 本地模型。

统一输出：

- assistant message。
- tool call。
- plan update。
- approval request。
- final summary。

### Prompt Orchestrator

Prompt Orchestrator 负责构造模型上下文。

必须包含：

- 当前 Workspace 摘要。
- 当前用户任务。
- 当前计划。
- 可用工具列表。
- 权限规则。
- 文件路径规则。
- 已读取文件摘要。
- 最近 tool result。
- UI 需要展示的状态要求。

### Context Builder

Context Builder 负责逐步查找相关文件。

执行顺序：

1. 读取 Workspace 摘要。
2. 读取规则文件。
3. 列相关目录。
4. 搜索关键词。
5. 读取候选文件片段。
6. 摘要大文件。
7. 把候选上下文交给模型。

Context Builder 需要输出：

- `openedFiles`
- `searchedPatterns`
- `skippedFiles`
- `sensitiveFiles`
- `contextSummary`

### Planner

Planner 负责把用户请求拆成可执行步骤。

每个步骤包含：

- `goal`
- `toolCategory`
- `readOnly`
- `writesFiles`
- `requiresApproval`
- `expectedFiles`
- `verification`

Planner 输出的计划直接驱动 UI Plan Card。

### Tool Router

Tool Router 负责把模型的意图转成具体工具。

路由规则：

- 文件定位使用 `list_directory`、`search_text`、`get_file_info`。
- 内容理解使用 `read_file`、`extract_pdf_text`、`read_docx`、`read_xlsx`。
- 文本修改优先使用 `patch_file`。
- 覆盖写入使用 `write_file` 并进入高风险审批。
- 删除使用 `delete_to_trash`。
- 批量操作先使用 preview，再执行。
- 命令执行使用 `run_command`，并附带 cwd、timeout、risk reason。
- 产物生成使用 `generate_artifact`。

Tool Router 必须把所有路径转换成 workspace-relative path，再交给 Permission Engine。

### Permission Engine

Permission Engine 负责批准或拦截工具调用。

检查项：

- 路径是否在 Workspace 内。
- 是否经过符号链接跳出 Workspace。
- 是否访问敏感文件。
- 是否写入、删除、覆盖或批量操作。
- 是否运行命令。
- 是否联网。
- 是否超过文件数量阈值。
- 是否已有 checkpoint。

输出：

- `allowed`
- `needsApproval`
- `denied`
- `approvalPrompt`
- `riskLevel`
- `reason`

### Tool Executor

Tool Executor 负责真实执行。

执行前：

- 校验 schema。
- 规范化路径。
- 创建 checkpoint。
- 记录 tool call。
- 推送 UI event。

执行中：

- 流式返回进度。
- 支持取消。
- 捕获错误。

执行后：

- 记录输出。
- 生成 diff。
- 更新 FileChange。
- 推送 UI event。
- 触发验证。

### Result Normalizer

Result Normalizer 把工具输出转成模型和 UI 都能理解的结构。

输出格式：

- `summary`
- `details`
- `files`
- `artifacts`
- `errors`
- `nextSuggestedAction`

### Verification Engine

Verification Engine 负责检查结果。

验证类型：

- 文件是否存在。
- 文件内容是否包含预期变化。
- 移动后的文件是否可访问。
- 生成的 artifact 是否可打开。
- 命令是否成功。
- 文档是否可解析。
- 表格行列是否符合预期。
- 用户指定标准是否满足。

验证结果直接进入 Verification Card。

### Event Stream

Event Stream 把 Runtime 状态推给 UI。

事件类型：

- `run.started`
- `run.status_changed`
- `plan.created`
- `context.scanned`
- `file.opened`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`
- `approval.requested`
- `approval.resolved`
- `checkpoint.created`
- `file.changed`
- `artifact.created`
- `verification.completed`
- `run.completed`
- `run.failed`
- `run.cancelled`

UI 所有提示都根据事件流更新。

## 9. 准确调用工具的设计要求

### 工具定义

每个工具必须有：

- 清晰名称。
- 单一职责。
- JSON schema。
- 参数说明。
- 路径约束。
- 风险等级。
- 是否可撤销。
- 是否需要 checkpoint。
- 是否支持 dry run。
- 输出 schema。

### 工具调用前校验

每次调用前执行：

- JSON schema 校验。
- 路径规范化。
- 相对路径解析。
- glob 展开预览。
- 文件存在性检查。
- 文件类型检查。
- 权限检查。
- 风险分类。
- checkpoint 检查。

### Dry Run

这些工具必须支持 dry run：

- `move_path`
- `delete_to_trash`
- `write_file`
- `copy_path`
- `run_command`
- 批量重命名。
- 批量格式化。

Dry run 结果进入 UI preview。

### 工具结果反馈给模型

模型收到的 tool result 必须简洁但完整：

```json
{
  "status": "success",
  "summary": "Modified reports/q1-summary.md",
  "filesChanged": ["reports/q1-summary.md"],
  "checkpointId": "chk_123",
  "next": "Run verification or summarize changes."
}
```

错误结果必须包含：

```json
{
  "status": "error",
  "errorType": "file_locked",
  "summary": "budget.xlsx is locked by another app.",
  "recoverable": true,
  "suggestedActions": ["retry", "skip_file", "ask_user"]
}
```

### 多步任务控制

复杂任务必须遵守：

- 先读上下文。
- 再计划。
- 再预览。
- 再审批。
- 再写入。
- 再验证。
- 再总结。

Agent 每完成一个关键步骤，都要更新计划状态。

### 防止模型乱调用工具

Runtime 必须具备硬约束：

- 模型不能直接写文件，只能请求工具。
- 模型不能绕过 Permission Engine。
- 模型不能传绝对路径直接执行，必须经过路径解析。
- 模型不能执行未注册工具。
- 模型不能静默删除文件。
- 模型不能跳过 checkpoint 写入文件。
- 模型不能把 raw command 当作普通文本执行。

这些约束由 Runtime 实现，不依赖模型自觉。

## 10. 权限与审批

### 权限模式

UI 提供：

- `Read only`
- `Ask before editing`
- `Workspace write`
- `Full access`

权限 chip 始终可见。

### 审批触发

这些动作触发审批：

- 写入 Workspace 外路径。
- 读取敏感文件内容。
- 批量修改。
- 删除。
- 覆盖写入。
- 运行命令。
- 联网。
- 打开外部应用。
- 访问系统目录。

### 审批文案模板

```text
Approval required

Agent wants to [action].

Reason:
[reason]

Affected:
[files or folders]

Safety:
[checkpoint / restore info]

Options:
Preview / Allow once / Deny
```

## 11. 规则文件与记忆

Workspace 支持规则文件：

- `AGENTS.md`
- `.local-agent/rules.md`

规则内容：

- 文件命名规则。
- 输出目录。
- 常用命令。
- 敏感文件说明。
- 文档风格。
- 任务偏好。
- 禁止修改区域。

UI 显示：

```text
Workspace instructions loaded
AGENTS.md · .local-agent/rules.md
```

点击后展示：

- 文件路径。
- 生效范围。
- 最近修改时间。
- 内容预览。

## 12. 产物设计

Artifact 必须显示：

- 产物名称。
- 类型。
- 相对路径。
- 来源文件。
- 生成时间。
- 预览。
- 打开文件。
- 复制路径。

Artifact 类型：

- Markdown。
- TXT。
- DOCX。
- XLSX。
- CSV。
- PDF。
- HTML。
- 图片。
- JSON。

Artifact 完成提示：

```text
Artifact created
outputs/q1-report.docx
Based on 12 source files.
```

## 13. 自动化与长任务

自动化对象包含：

- 名称。
- 目标 Workspace。
- 提示词。
- 频率。
- 权限模式。
- 模型。
- 下次运行时间。
- 结果收件箱。

自动化运行提示：

```text
Automation running
Agent is checking Marketing Docs for new files.
```

自动化完成提示：

```text
Automation finished
3 new findings are ready for review.
```

长任务提示：

```text
Long task
Agent will process 120 PDFs. Estimated time: 10-20 minutes.
```

操作：

- `Run in background`
- `Process first 10 files`
- `Cancel`

## 14. 设置项

必须包含：

- 默认权限模式。
- 模型 Provider。
- 默认模型。
- 推理强度。
- 是否允许联网。
- 是否允许运行命令。
- 命令审批策略。
- 文件忽略规则。
- checkpoint 保存位置。
- checkpoint 保留时间。
- 回收区位置。
- 回收区清理策略。
- 通知策略。
- Workspace 绝对路径显示策略。
- 敏感文件规则。

## 15. AgentRun 独立 UI 设计

AgentRun 不能只作为后台数据记录存在，必须在聊天界面中拥有独立、持续、可审查的运行 UI。每次用户发起一个需要读取文件、规划、执行工具、修改文件、生成产物或验证结果的任务时，界面必须创建一个 Run View，并把 AgentRun 的状态、计划、上下文、工具调用、审批、变更、产物和验证结果都映射到可见组件。

### Run View 总体布局

Run View 嵌入 Thread 主区域，位于消息流和 Composer 之间，也可以在长任务时展开为独立面板。

必须包含：

- Run Header。
- Plan Panel。
- Run Timeline。
- Context Panel。
- Approvals Panel。
- Changes Panel。
- Artifacts Panel。
- Verification Panel。
- Logs / Details Drawer。

### Run Header

Run Header 始终显示当前 AgentRun 的摘要状态。

必须显示：

- Workspace 名称。
- Thread 标题。
- AgentRun 状态。
- 当前步骤。
- 权限模式。
- checkpoint 状态。
- 已用时间。
- 停止或取消入口。

示例：

```text
Marketing Docs · Organize Q1 reports
Running · Planning · Ask before risky actions · Checkpoint pending · 00:18
```

### Plan Panel

Plan Panel 展示 Agent 对任务的拆解，是用户判断 Agent 是否理解任务的主要入口。

每个计划步骤显示：

- 步骤编号。
- 目标。
- 预计使用的工具类型。
- 是否只读。
- 是否会写文件。
- 是否需要审批。
- 预计影响文件。
- 验证方式。
- 当前状态：`pending` / `running` / `completed` / `blocked` / `failed` / `skipped`。

操作：

- `Approve plan`
- `Edit instruction`
- `Run selected step`
- `Cancel run`

### Run Timeline

Run Timeline 是 AgentRun 的事件流视图，按时间顺序显示所有关键事件。

事件类型：

- `run.started`
- `run.status_changed`
- `plan.created`
- `context.scanned`
- `file.opened`
- `tool.started`
- `tool.progress`
- `tool.completed`
- `tool.failed`
- `approval.requested`
- `approval.resolved`
- `checkpoint.created`
- `file.changed`
- `artifact.created`
- `verification.completed`
- `run.completed`
- `run.failed`
- `run.cancelled`

每个 timeline item 默认显示自然语言摘要，展开后显示原始 tool name、normalized input、output、riskLevel、permission decision、耗时。

### Context Panel

Context Panel 展示 Agent 实际使用了哪些文件和为什么使用。

分组：

- Opened files。
- Searched files。
- Skipped files。
- Sensitive files。
- User attachments。
- Generated artifacts。

每项显示：

- workspace-relative path。
- 文件状态。
- 使用原因。
- 是否读取内容。
- 是否含敏感标记。
- 打开文件入口。

### Approvals Panel

Approvals Panel 展示所有等待或已处理的审批。

必须显示：

- 请求动作。
- 风险等级。
- 原因。
- 影响文件或命令。
- 是否已有 checkpoint。
- `Preview` / `Allow once` / `Allow this type in this workspace` / `Deny`。

审批弹窗可以阻断执行，但审批记录必须保留在 Approvals Panel 中，供用户回看。

### Changes Panel

Changes Panel 是文件变更审查入口。

必须显示：

- Created / Modified / Moved / Copied / Deleted to trash / Restored 统计。
- 文件名。
- workspace-relative path。
- 变更原因。
- 关联 tool call。
- diff 入口。
- restore 入口。
- review state。

每个文件变更都必须能追溯到 AgentRun、ToolCall 和 Checkpoint。

### Artifacts Panel

Artifacts Panel 展示 Agent 生成的可交付结果。

必须显示：

- 产物名称。
- 类型。
- Workspace 相对路径。
- 来源文件数量。
- 生成时间。
- 预览。
- 打开文件。
- 复制路径。

### Verification Panel

Verification Panel 展示 Agent 是否验证了结果。

必须显示：

- 验证项列表。
- 通过数量。
- 失败数量。
- 警告数量。
- 未验证项。
- 失败原因。
- 重试入口。

### Logs / Details Drawer

Details Drawer 默认收起，只在用户需要审查技术细节时展开。

必须显示：

- tool name。
- raw input。
- normalized input。
- resolved absolute path。
- permission decision。
- raw output。
- error stack。
- duration。

### UI 与数据对象映射

| UI 区域 | 数据来源 |
| --- | --- |
| Run Header | AgentRun + Workspace + Thread |
| Plan Panel | AgentRun.plan |
| Run Timeline | AgentRun events / ToolCall / Approval / FileChange |
| Context Panel | AgentRun.contextFiles |
| Approvals Panel | AgentRun.approvals |
| Changes Panel | AgentRun.fileChanges |
| Artifacts Panel | AgentRun.artifacts |
| Verification Panel | AgentRun.verification |
| Details Drawer | ToolCall raw input/output + Permission Engine result |

## 16. 任务化开发清单

开发按任务逐个完成，不按大阶段推进。每个任务必须有明确交付物、验证方式和 UI 可见结果。只有当前任务构建通过并能在界面看到结果后，才进入下一个任务。

### T01 Workspace 数据模型

交付物：

- 新增 Workspace 类型。
- 新增 Workspace 数据表。
- Project 升级或映射为 Workspace。
- 保存 rootPath、displayName、permissionProfile、indexStatus、fileStats、ignoreRules、instructions。

验证：

- 创建文件夹项目后数据库能保存 Workspace 元信息。
- UI 能显示 Workspace 名称和完整路径详情。

### T02 Workspace 打开与扫描

交付物：

- 打开本地文件夹。
- 统计文件数量、目录数量、总大小。
- 识别主要文件类型。
- 识别项目文件、规则文件、敏感文件和大目录。
- 生成 Workspace 摘要。

验证：

- 添加文件夹后立即出现扫描结果。
- 敏感文件只显示文件名，不读取内容。

### T03 Workspace UI 卡片

交付物：

- Composer 下方显示 `Working in` 和权限模式。
- Workspace 详情弹层显示完整路径、扫描统计、索引状态、规则文件、敏感文件提示。
- Thread 标题区域显示 Workspace、AgentRun 状态和权限 chip。

验证：

- 用户始终能看见当前工作文件夹。

### T04 AgentRun 数据模型

交付物：

- 新增 AgentRun 表和类型。
- 记录 threadId、workspaceId、status、intent、plan、contextFiles、toolCalls、approvals、checkpoints、fileChanges、artifacts、verification、summary。

验证：

- 每次用户发起任务都会生成 AgentRun。
- Run 状态能从 started 更新到 completed/failed/cancelled。

### T05 AgentRun UI 骨架

交付物：

- Run Header。
- Plan Panel。
- Run Timeline。
- Context / Approvals / Changes / Artifacts / Verification 面板入口。
- Details Drawer。

验证：

- 即使 Runtime 还没有完整工具，UI 也能展示 mock 或最小真实 AgentRun 事件。

### T06 AgentRun Event Stream

交付物：

- 定义 run 事件类型。
- 主进程推送 run.started、status_changed、tool.started、tool.completed、run.completed 等事件。
- 前端订阅并更新 Run Timeline。

验证：

- 对话发送时能看到实时运行事件。

### T07 只读文件工具

交付物：

- `list_directory`
- `read_file`
- `search_text`
- `get_file_info`
- 路径全部限制在 Workspace 内。

验证：

- Agent 能列目录、搜索文本、读取普通文件。
- Context Panel 能显示已读取文件。

### T08 Permission Engine

交付物：

- 路径规范化。
- Workspace 内外判断。
- 符号链接跳出检测。
- 敏感文件检测。
- 风险等级判断。
- allowed / needsApproval / denied 输出。

验证：

- Workspace 外路径不会被静默访问。
- 敏感文件内容读取会触发审批或拒绝。

### T09 Planner

交付物：

- 将用户请求拆成可执行步骤。
- 每步标记 readOnly、writesFiles、requiresApproval、expectedFiles、verification。
- 计划进入 Plan Panel。

验证：

- 整理文件夹、总结资料、修改文档等请求能生成可见计划。

### T10 Tool Router

交付物：

- 将模型意图路由到注册工具。
- 校验 schema。
- 标准化 tool input。
- 拒绝未注册工具。

验证：

- 模型不能绕过工具系统直接写文件或执行命令。

### T11 Approval UI 与审批记录

交付物：

- Approval 表和 IPC。
- Approval Card。
- Approval 弹窗。
- Allow once / Allow this type in this workspace / Deny。

验证：

- 高风险动作会阻塞执行等待用户选择。
- 审批历史能在 Approvals Panel 回看。

### T12 Checkpoint 系统

交付物：

- create_checkpoint。
- restore_checkpoint。
- compare_file_versions。
- checkpoint manifest。
- Checkpoint Card。

验证：

- 写文件前自动创建 checkpoint。
- 能恢复单个文件和整个 AgentRun。

### T13 写入与变更工具

交付物：

- `create_file`
- `patch_file`
- `write_file`
- `create_directory`
- `copy_path`
- `move_path`
- `delete_to_trash`
- `restore_from_trash`

验证：

- 所有写入动作经过 Permission Engine。
- 所有写入动作记录 FileChange。
- 删除只进入应用内回收区。

### T14 Changes 面板与 Diff 审查

交付物：

- FileChange 表和 IPC。
- Changes Panel。
- diff 预览。
- review state。
- 单文件恢复入口。

验证：

- 用户能看到 Agent 修改、创建、移动、删除的每个文件。

### T15 Artifact 系统

交付物：

- Artifact 表和 IPC。
- generate_artifact。
- Artifact 预览面板。
- 打开文件和复制路径。

验证：

- 生成报告、CSV、Markdown 等结果后能在 UI 中预览和定位。

### T16 Verification Engine

交付物：

- 文件存在验证。
- 内容变化验证。
- 移动结果验证。
- 命令退出码验证。
- Artifact 可打开验证。
- Verification Card。

验证：

- 每个完成态 AgentRun 都有验证结果或明确未验证原因。

### T17 命令执行工具

交付物：

- run_command。
- 命令风险评估。
- cwd 限定。
- 输出摘要。
- 停止命令。

验证：

- 命令执行必须审批。
- 输出进入 Tool Event Card 和 Logs。

### T18 文档与表格工具

交付物：

- extract_pdf_text。
- read_docx / write_docx。
- read_xlsx / write_xlsx。
- ocr_image。

验证：

- Agent 能处理 PDF、Word、Excel、图片文字识别任务。

### T19 长任务与取消

交付物：

- AgentRun cancel。
- 后台运行状态。
- 长任务提示。
- 部分完成摘要。

验证：

- 用户能停止运行，且 UI 展示已完成和未完成步骤。

### T20 自动化任务

交付物：

- 自动化对象。
- 定时运行。
- 结果收件箱。
- 自动化运行 UI。

验证：

- Agent 能按频率检查 Workspace 并生成可回看的结果。

## 17. 质量标准

### Agent 执行质量

- 复杂任务能形成计划。
- 工具调用参数稳定。
- 文件路径解析正确。
- 写入前有 checkpoint。
- 高风险动作有审批。
- 失败后有恢复方案。
- 完成后有验证。

### UI 提示质量

- 每个 AgentRun 都能看到状态。
- 每个工具调用都有摘要。
- 每个文件变更都有来源。
- 每个审批都有原因和影响范围。
- 每个错误都有恢复选项。
- 每个完成态都有验证结果和残余风险。

### 文件安全质量

- Workspace 外写入被拦截。
- 敏感文件读取被提示。
- 删除进入回收区。
- Checkpoint 可恢复。
- 批量操作可预览。
- 用户手动改动有冲突检测。

## 18. 官方参考方向

设计参考 Codex 桌面端这些产品思想：

- Project 作为工作边界。
- Thread 作为任务上下文。
- 运行状态可视化。
- 工具调用事件化。
- 审批和沙箱。
- Review/changes 可审查。
- Automations 可回到任务上下文。
- Skills/AGENTS.md 作为项目规则和能力说明。

参考资料：

- OpenAI Developers：Codex app features
  https://developers.openai.com/codex/app/features
- OpenAI Developers：Agent approvals & security
  https://developers.openai.com/codex/agent-approvals-security
- OpenAI Developers：AGENTS.md
  https://developers.openai.com/codex/guides/agents-md
- OpenAI Developers：Codex app automations
  https://developers.openai.com/codex/app/automations
