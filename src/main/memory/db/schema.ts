import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ─── projects ────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path'),
  rootPath: text('root_path'),
  displayName: text('display_name'),
  permissionProfile: text('permission_profile').notNull().default('ask-before-editing'),
  indexStatus: text('index_status').notNull().default('not-indexed'),
  fileStatsJson: text('file_stats_json'),
  ignoreRulesJson: text('ignore_rules_json'),
  instructions: text('instructions'),
  lastOpenedAt: integer('last_opened_at'),
  icon: text('icon'),
  color: text('color'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status').notNull().default('active'),
})

// ─── conversations ───────────────────────────────────────────
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(), // daily | work | private | tool
  projectId: text('project_id'),
  title: text('title'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  status: text('status').notNull().default('active'),
})

// ─── events（第一版核心） ────────────────────────────────────
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    projectId: text('project_id'),
    eventType: text('event_type').notNull(),
    mode: text('mode').notNull(),
    contentJson: text('content_json').notNull(),
    sensitivity: text('sensitivity').notNull().default('normal'),
    createdAt: integer('created_at').notNull(),
    summaryStatus: text('summary_status').notNull().default('pending'),
  },
  (t) => [
    index('events_by_conv').on(t.conversationId, t.createdAt),
    index('events_by_summary').on(t.summaryStatus, t.createdAt),
  ]
)

// ─── agent_runs ───────────────────────────────────────────
export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    workspaceId: text('workspace_id'),
    status: text('status').notNull(),
    intent: text('intent').notNull(),
    planJson: text('plan_json').notNull().default('[]'),
    contextFilesJson: text('context_files_json').notNull().default('[]'),
    toolCallsJson: text('tool_calls_json').notNull().default('[]'),
    approvalsJson: text('approvals_json').notNull().default('[]'),
    checkpointsJson: text('checkpoints_json').notNull().default('[]'),
    fileChangesJson: text('file_changes_json').notNull().default('[]'),
    artifactsJson: text('artifacts_json').notNull().default('[]'),
    verificationJson: text('verification_json'),
    summary: text('summary'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('agent_runs_by_thread').on(t.threadId, t.startedAt),
    index('agent_runs_by_workspace').on(t.workspaceId, t.startedAt),
    index('agent_runs_by_status').on(t.status, t.startedAt),
  ]
)

// ─── approvals ────────────────────────────────────────────
export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    workspaceId: text('workspace_id'),
    action: text('action').notNull(),
    toolName: text('tool_name'),
    riskLevel: text('risk_level').notNull(),
    reason: text('reason').notNull(),
    affectedPathsJson: text('affected_paths_json').notNull().default('[]'),
    command: text('command'),
    checkpointRequired: integer('checkpoint_required').notNull().default(0),
    checkpointId: text('checkpoint_id'),
    status: text('status').notNull().default('pending'),
    decision: text('decision'),
    createdAt: integer('created_at').notNull(),
    resolvedAt: integer('resolved_at'),
  },
  (t) => [
    index('approvals_by_run').on(t.runId, t.createdAt),
    index('approvals_by_status').on(t.status, t.createdAt),
  ]
)

// ─── checkpoints ──────────────────────────────────────────
export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id'),
    runId: text('run_id').notNull(),
    name: text('name').notNull(),
    fileBackupsJson: text('file_backups_json').notNull().default('[]'),
    manifestJson: text('manifest_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('checkpoints_by_run').on(t.runId, t.createdAt),
    index('checkpoints_by_workspace').on(t.workspaceId, t.createdAt),
  ]
)

// ─── file_changes ────────────────────────────────────────
export const fileChanges = sqliteTable(
  'file_changes',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    type: text('type').notNull(),
    path: text('path').notNull(),
    oldPath: text('old_path'),
    backupPath: text('backup_path'),
    diff: text('diff'),
    reason: text('reason').notNull(),
    toolCallId: text('tool_call_id'),
    checkpointId: text('checkpoint_id'),
    reviewState: text('review_state').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('file_changes_by_run').on(t.runId, t.createdAt),
    index('file_changes_by_path').on(t.path, t.createdAt),
  ]
)

// ─── artifacts ───────────────────────────────────────────
export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    workspaceId: text('workspace_id'),
    name: text('name').notNull(),
    path: text('path').notNull(),
    type: text('type').notNull(),
    previewType: text('preview_type').notNull(),
    sourceFilesJson: text('source_files_json').notNull().default('[]'),
    size: integer('size').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('artifacts_by_run').on(t.runId, t.createdAt),
    index('artifacts_by_workspace').on(t.workspaceId, t.createdAt),
  ]
)

// ─── automations ────────────────────────────────────────
export const automations = sqliteTable(
  'automations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    workspaceId: text('workspace_id'),
    conversationId: text('conversation_id'),
    scheduleType: text('schedule_type').notNull().default('manual'),
    intervalMinutes: integer('interval_minutes'),
    timeOfDay: text('time_of_day'),
    nextRunAt: integer('next_run_at'),
    lastRunAt: integer('last_run_at'),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('automations_by_status').on(t.status, t.nextRunAt),
    index('automations_by_workspace').on(t.workspaceId, t.updatedAt),
  ]
)

export const automationRuns = sqliteTable(
  'automation_runs',
  {
    id: text('id').primaryKey(),
    automationId: text('automation_id').notNull(),
    runId: text('run_id'),
    status: text('status').notNull().default('pending'),
    summary: text('summary'),
    error: text('error'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('automation_runs_by_automation').on(t.automationId, t.startedAt),
    index('automation_runs_by_status').on(t.status, t.startedAt),
  ]
)

// ─── current_state（Phase 3 占位） ──────────────────────────
export const currentState = sqliteTable('current_state', {
  key: text('key').primaryKey(),
  domain: text('domain').notNull(),
  valueJson: text('value_json').notNull(),
  expiresAt: integer('expires_at'),
  updatedAt: integer('updated_at').notNull(),
  sourceEventId: text('source_event_id'),
})

// ─── memories（Phase 4 占位） ────────────────────────────────
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  key: text('key').notNull(), // 记忆标签/分类
  scope: text('scope').notNull(), // user | general | companion | work | tool
  memoryType: text('memory_type'),
  projectId: text('project_id'),
  content: text('content').notNull(),
  importance: text('importance').notNull().default('medium'), // low | medium | high
  confidence: integer('confidence').notNull().default(5),
  sensitivity: text('sensitivity').notNull().default('normal'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  status: text('status').notNull().default('active'),
  sourceEventIds: text('source_event_ids'),
  embeddingId: text('embedding_id'),
})

// ─── private_memories（Phase 4 占位，实际建在独立 db） ────────
export const privateMemories = sqliteTable('private_memories', {
  id: text('id').primaryKey(),
  privateType: text('private_type').notNull(),
  content: text('content').notNull(),
  recallStyle: text('recall_style'),
  importance: integer('importance').notNull().default(5),
  confidence: integer('confidence').notNull().default(5),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  status: text('status').notNull().default('active'),
  embeddingId: text('embedding_id'),
})

// ─── memory_embeddings（Phase 5 占位） ──────────────────────
export const memoryEmbeddings = sqliteTable('memory_embeddings', {
  id: text('id').primaryKey(),
  memoryId: text('memory_id').notNull(),
  vector: text('vector'), // Phase 5: sqlite-vec 替换
  modelName: text('model_name'),
  createdAt: integer('created_at').notNull(),
})

// ─── summary_jobs（Phase 4 占位） ───────────────────────────
export const summaryJobs = sqliteTable('summary_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('pending'),
  mode: text('mode').notNull(),
  conversationId: text('conversation_id'),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
  resultSummary: text('result_summary'),
})
