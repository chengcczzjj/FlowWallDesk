/** 壁纸资源描述（来自 assets/wallpaper/*）*/
export interface WallpaperItem {
  /** 文件夹名（唯一 id）*/
  id: string
  /** 显示名 */
  name: string
  /** 主资源（视频/图片/html）绝对路径或自定义协议 URL */
  source: string
  /** 类型：video / image / web */
  type: 'video' | 'image' | 'web'
  /** 预览图（可选）*/
  preview?: string
  /** 原始 FlowWallDeskInfo.json 的额外字段 */
  meta?: Record<string, unknown>
  /** 壁纸独立设置 */
  settings?: WallpaperSettings
}

/** 每个壁纸独立的显示设置 */
export interface WallpaperSettings {
  volume?: number
  speed?: number
  scaling?: string
  flip?: string
}

/** 当前应用中的壁纸状态 */
export interface WallpaperState {
  current?: WallpaperItem
  volume: number
  muted: boolean
}

/** 桌面组件元数据 */
export interface WidgetInstance {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  enabled: boolean
  config?: Record<string, unknown>
}

/** 桌面图标收纳条目 */
export interface DesktopIconItem {
  id: string
  name: string
  originalPath: string
  managedPath: string
  iconData?: string
  targetPath?: string
  targetArgs?: string
  workingDirectory?: string
  iconSourcePath?: string
  iconIndex?: number
  externalUrl?: string
  extension?: string
  isDirectory?: boolean
  removedFromDesktop: boolean
  x?: number
  y?: number
  order?: number
  addedAt: number
}

export interface DesktopIconImportResult {
  ok: boolean
  items: DesktopIconItem[]
  skipped?: string[]
  error?: string
}

export interface DesktopIconLaunchResult {
  ok: boolean
  error?: string
}

export type DesktopIconContextMenuAction = 'open' | 'show-in-folder' | 'restore' | 'remove'

export interface DesktopIconContextMenuResult {
  ok: boolean
  action?: DesktopIconContextMenuAction
  error?: string
}

export interface DesktopIconRestoreResult {
  ok: boolean
  restored: string[]
  skipped: string[]
  restoredItemIds?: string[]
  error?: string
}

/* ===== 数据服务类型 ===== */

/** 新闻条目 */
export interface NewsItem {
  index: number
  title: string
  hot?: string
  url?: string
}

/** 股票行情 */
export interface StockItem {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
}

/** 股票代码配置 */
export interface StockSymbol {
  code: string
  name: string
  market: string // '1' = 沪市, '0' = 深市
}

/** API 端点元数据（供 LLM 了解能力和限制） */
export interface ApiEndpointMeta {
  id: string
  name: string
  description: string
  provider: string
  baseUrl: string
  rateLimit: { maxRequests: number; periodMs: number; description: string }
  dataSchema: Record<string, string>
  configurable: { key: string; type: string; description: string; options?: string[] }[]
  currentUsage: { fetchCount: number; lastFetchTime: number | null; errorCount: number }
}

/* ===== AI 聊天 / 记忆系统类型 ===== */

export type WorkspacePermissionProfile = 'read-only' | 'ask-before-editing' | 'workspace-write' | 'full-access'

export type WorkspaceIndexStatus = 'not-indexed' | 'indexing' | 'ready' | 'partially-indexed' | 'index-failed'

export interface WorkspaceFileStats {
  fileCount: number
  directoryCount: number
  totalSize: number
  mainFileTypes: string[]
  projectFiles: string[]
  instructionFiles: string[]
  sensitiveFiles: string[]
  largeDirectories: string[]
  scannedAt: number
}

export interface WorkspaceIgnoreRules {
  patterns: string[]
  source: 'default' | 'workspace' | 'user'
}

/** 本地文件夹工作空间 */
export interface Workspace {
  id: string
  name: string
  rootPath: string | null
  displayName: string
  permissionProfile: WorkspacePermissionProfile
  indexStatus: WorkspaceIndexStatus
  fileStats: WorkspaceFileStats | null
  ignoreRules: WorkspaceIgnoreRules | null
  instructions: string | null
  createdAt: number
  lastOpenedAt: number
}

/** 项目（当前作为 Workspace 的 UI/兼容层） */
export interface ChatProject extends Workspace {
  path: string | null
  icon: string | null
  color: string | null
  updatedAt: number
  sortOrder: number
  status: string
}

export type ConversationMode = 'daily' | 'work' | 'private' | 'tool'

export interface ChatConversation {
  id: string
  mode: ConversationMode
  projectId: string | null
  title: string | null
  createdAt: number
  updatedAt: number
  status: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  eventType: 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result' | 'system_event'
  content: Record<string, unknown> & { text?: string }
  createdAt: number
}

export type AgentRunStatus =
  | 'idle'
  | 'scoping'
  | 'loading-context'
  | 'planning'
  | 'waiting-approval'
  | 'checkpointing'
  | 'executing'
  | 'verifying'
  | 'review-ready'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentPlanStep {
  id: string
  goal: string
  toolCategory: string
  readOnly: boolean
  writesFiles: boolean
  requiresApproval: boolean
  expectedFiles: string[]
  verification: string
  status: 'pending' | 'running' | 'completed' | 'blocked' | 'failed' | 'skipped'
}

export interface AgentRunVerification {
  passed: number
  failed: number
  warnings: number
  unchecked: number
  items: { name: string; status: 'passed' | 'failed' | 'warning' | 'unchecked'; message?: string }[]
}

export type AgentApprovalStatus = 'pending' | 'approved' | 'denied'
export type AgentApprovalDecision = 'allow-once' | 'allow-workspace' | 'deny'
export type AgentApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface AgentApproval {
  id: string
  runId: string
  threadId: string
  workspaceId: string | null
  action: string
  toolName: string | null
  riskLevel: AgentApprovalRiskLevel
  reason: string
  affectedPaths: string[]
  command: string | null
  checkpointRequired: boolean
  checkpointId: string | null
  status: AgentApprovalStatus
  decision: AgentApprovalDecision | null
  createdAt: number
  resolvedAt: number | null
}

export interface AgentCheckpointFileBackup {
  path: string
  backupPath: string
  size: number
  modifiedAt: number
  checksum: string
}

export interface AgentCheckpoint {
  id: string
  workspaceId: string | null
  runId: string
  name: string
  fileBackups: AgentCheckpointFileBackup[]
  manifest: { fileCount: number; totalSize: number; createdBy: string }
  createdAt: number
}

export type AgentFileChangeType = 'created' | 'modified' | 'moved' | 'copied' | 'deleted-to-trash' | 'restored'
export type AgentFileChangeReviewState = 'pending' | 'accepted' | 'rejected' | 'restored'

export interface AgentFileChange {
  id: string
  runId: string
  type: AgentFileChangeType
  path: string
  oldPath: string | null
  backupPath: string | null
  diff: string | null
  reason: string
  toolCallId: string | null
  checkpointId: string | null
  reviewState: AgentFileChangeReviewState
  createdAt: number
}

export type AgentArtifactType = 'markdown' | 'text' | 'csv' | 'json' | 'html' | 'document' | 'spreadsheet' | 'image' | 'other'
export type AgentArtifactPreviewType = 'markdown' | 'text' | 'table' | 'html' | 'image' | 'none'

export interface AgentArtifact {
  id: string
  runId: string
  workspaceId: string | null
  name: string
  path: string
  type: AgentArtifactType
  previewType: AgentArtifactPreviewType
  sourceFiles: string[]
  size: number
  createdAt: number
}

export interface AgentRun {
  id: string
  threadId: string
  workspaceId: string | null
  status: AgentRunStatus
  intent: string
  plan: AgentPlanStep[]
  contextFiles: string[]
  toolCalls: string[]
  approvals: AgentApproval[]
  checkpoints: AgentCheckpoint[]
  fileChanges: AgentFileChange[]
  artifacts: AgentArtifact[]
  verification: AgentRunVerification | null
  summary: string | null
  startedAt: number
  finishedAt: number | null
}

export interface AgentRunEvent {
  type: 'run.started' | 'run.status_changed' | 'approval.requested' | 'approval.resolved' | 'run.completed' | 'run.failed' | 'run.cancelled'
  runId: string
  threadId: string
  workspaceId: string | null
  status: AgentRunStatus
  summary?: string
  run?: AgentRun
  createdAt: number
}

export type AgentAutomationStatus = 'active' | 'paused' | 'deleted'
export type AgentAutomationScheduleType = 'manual' | 'interval' | 'daily'
export type AgentAutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AgentAutomation {
  id: string
  name: string
  prompt: string
  workspaceId: string | null
  conversationId: string | null
  scheduleType: AgentAutomationScheduleType
  intervalMinutes: number | null
  timeOfDay: string | null
  nextRunAt: number | null
  lastRunAt: number | null
  status: AgentAutomationStatus
  createdAt: number
  updatedAt: number
}

export interface AgentAutomationResult {
  id: string
  automationId: string
  runId: string | null
  status: AgentAutomationRunStatus
  summary: string | null
  error: string | null
  startedAt: number
  finishedAt: number | null
}

export type ModelProvider = 'openai-compatible' | 'google'

export interface ModelProfile {
  id: string
  name: string
  provider: ModelProvider
  baseURL: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
  headers?: Record<string, string>
}
