import type {
  Model,
  Session,
  SessionKind,
  SessionOrigin,
  SessionStatus,
} from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';

interface SessionRow {
  id: string;
  pid: number | null;
  project_id: string;
  parent_session_id: string | null;
  origin: SessionOrigin;
  model: string | null;
  status: SessionStatus;
  context_usage_pct: number;
  orbit_slot: number;
  cwd: string;
  name: string | null;
  kind: SessionKind | null;
  advisor_role: string | null;
  worktree_path: string | null;
  current_mission_id: string | null;
  last_completed_mission_id: string | null;
  created_at: number;
  updated_at: number;
  terminated_at: number | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    pid: row.pid ?? 0,
    cwd: row.cwd,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    model: (row.model ?? 'default') as Model,
    origin: row.origin,
    kind: row.kind ?? 'user',
    advisorRole: row.advisor_role ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    contextUsagePct: row.context_usage_pct,
    currentMissionId: row.current_mission_id ?? undefined,
    lastCompletedMissionId: row.last_completed_mission_id ?? undefined,
    orbitSlot: row.orbit_slot,
    name: row.name ?? undefined,
    worktreePath: row.worktree_path ?? undefined,
  };
}

function nextOrbitSlot(db: DB, projectId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(orbit_slot), -1) AS max_slot
       FROM sessions
       WHERE project_id = ? AND parent_session_id IS NULL
         AND status NOT IN ('terminated')`,
    )
    .get(projectId) as { max_slot: number };
  return (row.max_slot ?? -1) + 1;
}

export interface CreateSessionInput {
  id: string;
  pid: number;
  projectId: string;
  cwd: string;
  origin: SessionOrigin;
  model?: Model;
  parentSessionId?: string;
  kind?: SessionKind;
  advisorRole?: string;
  worktreePath?: string;
}

export function upsertSession(db: DB, input: CreateSessionInput): Session {
  const ts = now();
  const existing = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(input.id) as SessionRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE sessions
       SET pid = ?, status = CASE WHEN status = 'terminated' THEN 'idle' ELSE status END,
           updated_at = ?
       WHERE id = ?`,
    ).run(input.pid, ts, input.id);
    return rowToSession({
      ...existing,
      pid: input.pid,
      updated_at: ts,
    });
  }

  const orbitSlot = input.parentSessionId
    ? 0
    : nextOrbitSlot(db, input.projectId);
  const status: SessionStatus = 'idle';
  const kind: SessionKind = input.kind ?? 'user';

  db.prepare(
    `INSERT INTO sessions (
       id, pid, project_id, parent_session_id, origin, model, status,
       context_usage_pct, orbit_slot, cwd, name, kind, advisor_role,
       worktree_path, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.pid,
    input.projectId,
    input.parentSessionId ?? null,
    input.origin,
    input.model ?? 'default',
    status,
    orbitSlot,
    input.cwd,
    kind,
    input.advisorRole ?? null,
    input.worktreePath ?? null,
    ts,
    ts,
  );

  return {
    id: input.id,
    pid: input.pid,
    cwd: input.cwd,
    projectId: input.projectId,
    createdAt: ts,
    updatedAt: ts,
    status,
    model: input.model ?? 'default',
    origin: input.origin,
    kind,
    advisorRole: input.advisorRole,
    parentSessionId: input.parentSessionId,
    contextUsagePct: 0,
    orbitSlot,
    worktreePath: input.worktreePath,
  };
}

export function setSessionStatus(
  db: DB,
  sessionId: string,
  status: SessionStatus,
): Session | null {
  const ts = now();
  if (status === 'terminated') {
    db.prepare(
      `UPDATE sessions SET status = ?, updated_at = ?, terminated_at = ? WHERE id = ?`,
    ).run(status, ts, ts, sessionId);
  } else {
    db.prepare(
      `UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`,
    ).run(status, ts, sessionId);
  }
  return getSession(db, sessionId);
}

export function setSessionMission(
  db: DB,
  sessionId: string,
  missionId: string | null,
): Session | null {
  const ts = now();
  db.prepare(
    `UPDATE sessions SET current_mission_id = ?, updated_at = ? WHERE id = ?`,
  ).run(missionId, ts, sessionId);
  return getSession(db, sessionId);
}

export function setSessionContextUsage(
  db: DB,
  sessionId: string,
  pct: number,
): Session | null {
  const clamped = Math.max(0, Math.min(100, pct));
  const ts = now();
  db.prepare(
    `UPDATE sessions SET context_usage_pct = ?, updated_at = ? WHERE id = ?`,
  ).run(clamped, ts, sessionId);
  return getSession(db, sessionId);
}

export function getSession(db: DB, sessionId: string): Session | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listActiveSessions(db: DB): Session[] {
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE status != 'terminated'
       ORDER BY created_at ASC`,
    )
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function listSessionsForProject(db: DB, projectId: string): Session[] {
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE project_id = ? AND status != 'terminated'
       ORDER BY created_at ASC`,
    )
    .all(projectId) as SessionRow[];
  return rows.map(rowToSession);
}
