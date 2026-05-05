import Database from 'better-sqlite3';
import { DB_PATH, ensureSolixHome } from './paths.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pid INTEGER,
  project_id TEXT NOT NULL REFERENCES projects(id),
  parent_session_id TEXT REFERENCES sessions(id),
  origin TEXT NOT NULL CHECK (origin IN ('external','internal')),
  model TEXT,
  status TEXT NOT NULL,
  context_usage_pct REAL DEFAULT 0,
  orbit_slot INTEGER NOT NULL,
  cwd TEXT NOT NULL,
  name TEXT,
  kind TEXT NOT NULL DEFAULT 'user',
  advisor_role TEXT,
  current_mission_id TEXT,
  last_completed_mission_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions(kind);

CREATE TABLE IF NOT EXISTS advisors (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  codename TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  glyph TEXT,
  color TEXT,
  default_model TEXT,
  agent_md_path TEXT NOT NULL,
  required_skills_json TEXT DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  pinned_session_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('anthropic','solix','user')),
  manifest_path TEXT NOT NULL,
  installed_in_projects_json TEXT DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS galaxy_imports (
  id TEXT PRIMARY KEY,
  source_url TEXT,
  manifest_json TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  session_id TEXT,
  advisor_id TEXT,
  project_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_events(session_id);

CREATE TABLE IF NOT EXISTS galaxy_versions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  author TEXT,
  description TEXT,
  manifest_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_galaxy_versions_ts ON galaxy_versions(ts);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  prompt TEXT NOT NULL,
  short_name TEXT,
  long_summary TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  total_tokens INTEGER,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  subagent_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  files_touched_json TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_missions_session ON missions(session_id);
CREATE INDEX IF NOT EXISTS idx_missions_completed_at ON missions(completed_at);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  mission_id TEXT,
  tool TEXT NOT NULL,
  args_json TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  prompt TEXT NOT NULL,
  cron TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL
);
`;

export type DB = Database.Database;

let _db: DB | null = null;

interface PragmaColumn {
  name: string;
}

function ensureColumn(
  db: DB,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as PragmaColumn[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function getDb(): DB {
  if (_db) return _db;
  ensureSolixHome();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Idempotent column adds for repos upgrading from M0+M1.
  ensureColumn(db, 'sessions', 'kind', "kind TEXT NOT NULL DEFAULT 'user'");
  ensureColumn(db, 'sessions', 'advisor_role', 'advisor_role TEXT');
  ensureColumn(db, 'advisors', 'texture_pack', 'texture_pack TEXT');
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
