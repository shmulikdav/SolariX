import { nanoid } from 'nanoid';
import type { Mission, MissionStatus } from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';

interface MissionRow {
  id: string;
  session_id: string;
  prompt: string;
  short_name: string | null;
  long_summary: string | null;
  status: MissionStatus;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  total_tokens: number | null;
  lines_added: number;
  lines_removed: number;
  subagent_count: number;
  tool_call_count: number;
  files_touched_json: string;
  error_summary: string | null;
  goal_id: string | null;
}

function rowToMission(row: MissionRow): Mission {
  let filesTouched: string[] = [];
  try {
    filesTouched = JSON.parse(row.files_touched_json) as string[];
  } catch {
    filesTouched = [];
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    prompt: row.prompt,
    shortName: row.short_name ?? row.prompt.slice(0, 32),
    longSummary: row.long_summary ?? undefined,
    status: row.status,
    metrics: {
      durationMs: row.duration_ms ?? undefined,
      totalTokens: row.total_tokens ?? undefined,
      linesAdded: row.lines_added,
      linesRemoved: row.lines_removed,
      subagentCount: row.subagent_count,
      toolCallCount: row.tool_call_count,
    },
    filesTouched,
    errorSummary: row.error_summary ?? undefined,
    goalId: row.goal_id ?? undefined,
  };
}

/** Record (or overwrite) the error summary for a mission. The most recent
 * tool failure wins — that's what the UI surfaces in MissionView. */
export function setMissionError(
  db: DB,
  missionId: string,
  errorSummary: string,
): Mission | null {
  db.prepare(
    `UPDATE missions SET error_summary = ? WHERE id = ?`,
  ).run(errorSummary, missionId);
  return getMission(db, missionId);
}

function shortNameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 3);
  if (!words.length) return 'New Mission';
  return words
    .map((w) =>
      w
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .filter(Boolean)
    .join(' ') || 'New Mission';
}

export function startMission(
  db: DB,
  sessionId: string,
  prompt: string,
  goalId?: string,
): Mission {
  const id = nanoid();
  const ts = now();
  const shortName = shortNameFromPrompt(prompt);
  db.prepare(
    `INSERT INTO missions (id, session_id, prompt, short_name, status, started_at, files_touched_json, goal_id)
     VALUES (?, ?, ?, ?, 'active', ?, '[]', ?)`,
  ).run(id, sessionId, prompt, shortName, ts, goalId ?? null);

  return {
    id,
    sessionId,
    startedAt: ts,
    prompt,
    shortName,
    status: 'active',
    metrics: { subagentCount: 0, toolCallCount: 0 },
    filesTouched: [],
    goalId,
  };
}

/** Sprint M — roll a message's token count into the mission's total.
 * Populates the previously-unused missions.total_tokens column. */
export function addMissionTokens(
  db: DB,
  missionId: string,
  tokens: number,
): void {
  if (tokens <= 0) return;
  db.prepare(
    `UPDATE missions SET total_tokens = COALESCE(total_tokens, 0) + ? WHERE id = ?`,
  ).run(Math.round(tokens), missionId);
}

export function completeMission(
  db: DB,
  missionId: string,
  status: MissionStatus = 'completed',
): Mission | null {
  const ts = now();
  const row = db
    .prepare('SELECT * FROM missions WHERE id = ?')
    .get(missionId) as MissionRow | undefined;
  if (!row) return null;
  const durationMs = ts - row.started_at;
  db.prepare(
    `UPDATE missions
     SET status = ?, completed_at = ?, duration_ms = ?
     WHERE id = ?`,
  ).run(status, ts, durationMs, missionId);
  return getMission(db, missionId);
}

export function bumpToolCallCount(db: DB, missionId: string): void {
  db.prepare(
    `UPDATE missions SET tool_call_count = tool_call_count + 1 WHERE id = ?`,
  ).run(missionId);
}

export function bumpSubagentCount(db: DB, missionId: string): void {
  db.prepare(
    `UPDATE missions SET subagent_count = subagent_count + 1 WHERE id = ?`,
  ).run(missionId);
}

export function addTouchedFile(
  db: DB,
  missionId: string,
  filePath: string,
): void {
  const row = db
    .prepare('SELECT files_touched_json FROM missions WHERE id = ?')
    .get(missionId) as { files_touched_json: string } | undefined;
  if (!row) return;
  let files: string[] = [];
  try {
    files = JSON.parse(row.files_touched_json) as string[];
  } catch {
    files = [];
  }
  if (!files.includes(filePath)) {
    files.push(filePath);
    db.prepare('UPDATE missions SET files_touched_json = ? WHERE id = ?').run(
      JSON.stringify(files),
      missionId,
    );
  }
}

export function getMission(db: DB, missionId: string): Mission | null {
  const row = db
    .prepare('SELECT * FROM missions WHERE id = ?')
    .get(missionId) as MissionRow | undefined;
  return row ? rowToMission(row) : null;
}

export function listMissions(
  db: DB,
  opts: { sessionId?: string; projectId?: string; limit?: number } = {},
): Mission[] {
  const limit = Math.min(opts.limit ?? 200, 1000);
  if (opts.sessionId) {
    const rows = db
      .prepare(
        `SELECT * FROM missions WHERE session_id = ? ORDER BY started_at DESC LIMIT ?`,
      )
      .all(opts.sessionId, limit) as MissionRow[];
    return rows.map(rowToMission);
  }
  if (opts.projectId) {
    const rows = db
      .prepare(
        `SELECT m.* FROM missions m
         JOIN sessions s ON s.id = m.session_id
         WHERE s.project_id = ?
         ORDER BY m.started_at DESC LIMIT ?`,
      )
      .all(opts.projectId, limit) as MissionRow[];
    return rows.map(rowToMission);
  }
  const rows = db
    .prepare(`SELECT * FROM missions ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as MissionRow[];
  return rows.map(rowToMission);
}
