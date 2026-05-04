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
  current_mission_id TEXT,
  last_completed_mission_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

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

export function getDb(): DB {
  if (_db) return _db;
  ensureSolixHome();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
