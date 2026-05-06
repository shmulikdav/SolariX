import type { TimelineEvent } from '@solix/shared';
import type { DB } from '../db.js';

/**
 * Synthesize a chronological timeline from existing tables.
 *
 * No new persistence — we derive events at query time from
 *   sessions (created_at, terminated_at, status)
 *   missions (started_at, completed_at)
 *   tool_calls (started_at)
 *
 * The web client uses this to scrub the playback slider: given a time
 * T, it can replay events ≤ T and derive "scene at T" entirely on the
 * client side.
 */
interface SessionRow {
  id: string;
  project_id: string;
  cwd: string;
  status: string;
  created_at: number;
  terminated_at: number | null;
}

interface MissionRow {
  id: string;
  session_id: string;
  short_name: string | null;
  prompt: string;
  status: string;
  started_at: number;
  completed_at: number | null;
}

interface ToolCallRow {
  session_id: string;
  tool: string;
  started_at: number;
}

export interface TimelineRange {
  earliest: number;
  latest: number;
  events: TimelineEvent[];
}

export function loadTimeline(
  db: DB,
  opts: { sinceMs?: number; untilMs?: number; limit?: number } = {},
): TimelineRange {
  const sinceMs = opts.sinceMs ?? 0;
  const untilMs = opts.untilMs ?? Date.now();
  // Hard cap to keep payloads bounded — a busy half-hour can fire
  // thousands of tool calls.
  const limit = Math.min(opts.limit ?? 5000, 20000);

  const sessions = db
    .prepare(
      `SELECT id, project_id, cwd, status, created_at, terminated_at
       FROM sessions
       WHERE created_at <= ?
         AND (terminated_at IS NULL OR terminated_at >= ?)`,
    )
    .all(untilMs, sinceMs) as SessionRow[];

  const missions = db
    .prepare(
      `SELECT id, session_id, short_name, prompt, status, started_at, completed_at
       FROM missions
       WHERE started_at <= ?
         AND (completed_at IS NULL OR completed_at >= ?)
       ORDER BY started_at ASC
       LIMIT ?`,
    )
    .all(untilMs, sinceMs, limit) as MissionRow[];

  const toolCalls = db
    .prepare(
      `SELECT session_id, tool, started_at
       FROM tool_calls
       WHERE started_at BETWEEN ? AND ?
       ORDER BY started_at ASC
       LIMIT ?`,
    )
    .all(sinceMs, untilMs, limit) as ToolCallRow[];

  const sessionMeta = new Map<
    string,
    { projectId: string; cwd: string }
  >();
  for (const s of sessions) {
    sessionMeta.set(s.id, { projectId: s.project_id, cwd: s.cwd });
  }

  const events: TimelineEvent[] = [];

  for (const s of sessions) {
    if (s.created_at >= sinceMs && s.created_at <= untilMs) {
      events.push({
        ts: s.created_at,
        type: 'session_started',
        sessionId: s.id,
        projectId: s.project_id,
        cwd: s.cwd,
      });
    }
    if (
      s.terminated_at &&
      s.terminated_at >= sinceMs &&
      s.terminated_at <= untilMs
    ) {
      events.push({
        ts: s.terminated_at,
        type: 'session_terminated',
        sessionId: s.id,
        projectId: s.project_id,
        cwd: s.cwd,
      });
    }
  }

  for (const m of missions) {
    if (m.started_at >= sinceMs && m.started_at <= untilMs) {
      const meta = sessionMeta.get(m.session_id);
      events.push({
        ts: m.started_at,
        type: 'mission_started',
        sessionId: m.session_id,
        projectId: meta?.projectId,
        cwd: meta?.cwd,
        missionId: m.id,
        missionShortName: m.short_name ?? undefined,
        missionPrompt: m.prompt,
      });
    }
    if (
      m.completed_at &&
      m.completed_at >= sinceMs &&
      m.completed_at <= untilMs
    ) {
      const meta = sessionMeta.get(m.session_id);
      events.push({
        ts: m.completed_at,
        type: 'mission_completed',
        sessionId: m.session_id,
        projectId: meta?.projectId,
        cwd: meta?.cwd,
        missionId: m.id,
        missionShortName: m.short_name ?? undefined,
      });
    }
  }

  for (const t of toolCalls) {
    const meta = sessionMeta.get(t.session_id);
    events.push({
      ts: t.started_at,
      type: 'tool_call',
      sessionId: t.session_id,
      projectId: meta?.projectId,
      cwd: meta?.cwd,
      toolName: t.tool,
    });
  }

  events.sort((a, b) => a.ts - b.ts);

  // Cap final size — the most recent N events if we overflow.
  const capped =
    events.length > limit ? events.slice(events.length - limit) : events;

  const earliest = capped.length ? capped[0]!.ts : sinceMs;
  const latest = capped.length ? capped[capped.length - 1]!.ts : untilMs;

  return { earliest, latest, events: capped };
}
