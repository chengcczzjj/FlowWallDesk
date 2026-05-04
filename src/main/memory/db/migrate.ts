import type Database from 'better-sqlite3'

const MAIN_TABLES = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT,
  root_path TEXT,
  display_name TEXT,
  permission_profile TEXT NOT NULL DEFAULT 'ask-before-editing',
  index_status TEXT NOT NULL DEFAULT 'not-indexed',
  file_stats_json TEXT,
  ignore_rules_json TEXT,
  instructions TEXT,
  last_opened_at INTEGER,
  icon TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  project_id TEXT,
  event_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  content_json TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL,
  summary_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS events_by_conv ON events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS events_by_summary ON events(summary_status, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  workspace_id TEXT,
  status TEXT NOT NULL,
  intent TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '[]',
  context_files_json TEXT NOT NULL DEFAULT '[]',
  tool_calls_json TEXT NOT NULL DEFAULT '[]',
  approvals_json TEXT NOT NULL DEFAULT '[]',
  checkpoints_json TEXT NOT NULL DEFAULT '[]',
  file_changes_json TEXT NOT NULL DEFAULT '[]',
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  verification_json TEXT,
  summary TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS agent_runs_by_thread ON agent_runs(thread_id, started_at);
CREATE INDEX IF NOT EXISTS agent_runs_by_workspace ON agent_runs(workspace_id, started_at);
CREATE INDEX IF NOT EXISTS agent_runs_by_status ON agent_runs(status, started_at);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  workspace_id TEXT,
  action TEXT NOT NULL,
  tool_name TEXT,
  risk_level TEXT NOT NULL,
  reason TEXT NOT NULL,
  affected_paths_json TEXT NOT NULL DEFAULT '[]',
  command TEXT,
  checkpoint_required INTEGER NOT NULL DEFAULT 0,
  checkpoint_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS approvals_by_run ON approvals(run_id, created_at);
CREATE INDEX IF NOT EXISTS approvals_by_status ON approvals(status, created_at);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_backups_json TEXT NOT NULL DEFAULT '[]',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS checkpoints_by_run ON checkpoints(run_id, created_at);
CREATE INDEX IF NOT EXISTS checkpoints_by_workspace ON checkpoints(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS file_changes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  old_path TEXT,
  backup_path TEXT,
  diff TEXT,
  reason TEXT NOT NULL,
  tool_call_id TEXT,
  checkpoint_id TEXT,
  review_state TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS file_changes_by_run ON file_changes(run_id, created_at);
CREATE INDEX IF NOT EXISTS file_changes_by_path ON file_changes(path, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_id TEXT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  preview_type TEXT NOT NULL,
  source_files_json TEXT NOT NULL DEFAULT '[]',
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_by_run ON artifacts(run_id, created_at);
CREATE INDEX IF NOT EXISTS artifacts_by_workspace ON artifacts(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  workspace_id TEXT,
  conversation_id TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'manual',
  interval_minutes INTEGER,
  time_of_day TEXT,
  next_run_at INTEGER,
  last_run_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS automations_by_status ON automations(status, next_run_at);
CREATE INDEX IF NOT EXISTS automations_by_workspace ON automations(workspace_id, updated_at);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS automation_runs_by_automation ON automation_runs(automation_id, started_at);
CREATE INDEX IF NOT EXISTS automation_runs_by_status ON automation_runs(status, started_at);

CREATE TABLE IF NOT EXISTS current_state (
  key TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  value_json TEXT NOT NULL,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL,
  source_event_id TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  memory_type TEXT,
  project_id TEXT,
  content TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  confidence INTEGER NOT NULL DEFAULT 5,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  source_event_ids TEXT,
  embedding_id TEXT
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  vector TEXT,
  model_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS summary_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL,
  conversation_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  result_summary TEXT
);
`

const PRIVATE_TABLES = `
CREATE TABLE IF NOT EXISTS private_memories (
  id TEXT PRIMARY KEY,
  private_type TEXT NOT NULL,
  content TEXT NOT NULL,
  recall_style TEXT,
  importance INTEGER NOT NULL DEFAULT 5,
  confidence INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  embedding_id TEXT
);
`

export function runMigrations(db: Database.Database, scope: 'main' | 'private'): void {
  const sql = scope === 'main' ? MAIN_TABLES : PRIVATE_TABLES
  db.exec(sql)

  // 增量迁移：为旧数据库添加 key 列
  if (scope === 'main') {
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN key TEXT NOT NULL DEFAULT ''`)
    } catch {
      // 列已存在 — 忽略
    }
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS memories_by_key ON memories(key)`)
    } catch {
      // 索引已存在 — 忽略
    }

    // 增量迁移：projects 表（v2 新增）
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT,
        root_path TEXT,
        display_name TEXT,
        permission_profile TEXT NOT NULL DEFAULT 'ask-before-editing',
        index_status TEXT NOT NULL DEFAULT 'not-indexed',
        file_stats_json TEXT,
        ignore_rules_json TEXT,
        instructions TEXT,
        last_opened_at INTEGER,
        icon TEXT,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active'
      )`)
    } catch {
      // 表已存在 — 忽略
    }

    const projectColumns = [
      `ALTER TABLE projects ADD COLUMN root_path TEXT`,
      `ALTER TABLE projects ADD COLUMN display_name TEXT`,
      `ALTER TABLE projects ADD COLUMN permission_profile TEXT NOT NULL DEFAULT 'ask-before-editing'`,
      `ALTER TABLE projects ADD COLUMN index_status TEXT NOT NULL DEFAULT 'not-indexed'`,
      `ALTER TABLE projects ADD COLUMN file_stats_json TEXT`,
      `ALTER TABLE projects ADD COLUMN ignore_rules_json TEXT`,
      `ALTER TABLE projects ADD COLUMN instructions TEXT`,
      `ALTER TABLE projects ADD COLUMN last_opened_at INTEGER`,
    ]
    for (const sql of projectColumns) {
      try {
        db.exec(sql)
      } catch {
        // 列已存在 — 忽略
      }
    }
    try {
      db.exec(`UPDATE projects SET root_path = COALESCE(root_path, path), display_name = COALESCE(display_name, name), last_opened_at = COALESCE(last_opened_at, updated_at)`)
    } catch {
      // 兼容旧表 — 忽略
    }

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        workspace_id TEXT,
        action TEXT NOT NULL,
        tool_name TEXT,
        risk_level TEXT NOT NULL,
        reason TEXT NOT NULL,
        affected_paths_json TEXT NOT NULL DEFAULT '[]',
        command TEXT,
        checkpoint_required INTEGER NOT NULL DEFAULT 0,
        checkpoint_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        decision TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS approvals_by_run ON approvals(run_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS approvals_by_status ON approvals(status, created_at)`)
    } catch {
      // 表或索引已存在 — 忽略
    }

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        run_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_backups_json TEXT NOT NULL DEFAULT '[]',
        manifest_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS checkpoints_by_run ON checkpoints(run_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS checkpoints_by_workspace ON checkpoints(workspace_id, created_at)`)
    } catch {
      // 表或索引已存在 — 忽略
    }

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS file_changes (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        old_path TEXT,
        backup_path TEXT,
        diff TEXT,
        reason TEXT NOT NULL,
        tool_call_id TEXT,
        checkpoint_id TEXT,
        review_state TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS file_changes_by_run ON file_changes(run_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS file_changes_by_path ON file_changes(path, created_at)`)
    } catch {
      // 表或索引已存在 — 忽略
    }

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        workspace_id TEXT,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        preview_type TEXT NOT NULL,
        source_files_json TEXT NOT NULL DEFAULT '[]',
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS artifacts_by_run ON artifacts(run_id, created_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS artifacts_by_workspace ON artifacts(workspace_id, created_at)`)
    } catch {
      // 表或索引已存在 — 忽略
    }

    try {
      db.exec(`CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        workspace_id TEXT,
        conversation_id TEXT,
        schedule_type TEXT NOT NULL DEFAULT 'manual',
        interval_minutes INTEGER,
        time_of_day TEXT,
        next_run_at INTEGER,
        last_run_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS automations_by_status ON automations(status, next_run_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS automations_by_workspace ON automations(workspace_id, updated_at)`)
      db.exec(`CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL,
        run_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        summary TEXT,
        error TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      )`)
      db.exec(`CREATE INDEX IF NOT EXISTS automation_runs_by_automation ON automation_runs(automation_id, started_at)`)
      db.exec(`CREATE INDEX IF NOT EXISTS automation_runs_by_status ON automation_runs(status, started_at)`)
    } catch {
      // 表或索引已存在 — 忽略
    }
  }
}
