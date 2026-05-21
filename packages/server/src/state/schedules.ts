import { nanoid } from 'nanoid';
import type { ScheduledTask } from '@solix/shared';
import type { DB } from '../db.js';
import { ensureProject } from './projects.js';
import { now } from '../util.js';

interface ScheduleRow {
  id: string;
  project_id: string;
  cwd: string | null;
  name: string | null;
  prompt: string;
  cron: string;
  enabled: number;
  last_run_at: number | null;
  next_run_at: number;
}

function rowToSchedule(row: ScheduleRow): ScheduledTask {
  return {
    id: row.id,
    projectId: row.project_id,
    cwd: row.cwd ?? '',
    name: row.name ?? undefined,
    prompt: row.prompt,
    cron: row.cron,
    enabled: row.enabled !== 0,
    lastRunAt: row.last_run_at ?? undefined,
    nextRunAt: row.next_run_at,
  };
}

/**
 * Parse a simple cadence string into milliseconds. Sprint M supports
 * `<n>m` (minutes), `<n>h` (hours), `<n>d` (days). Full cron is future
 * work. Returns null for unparseable input.
 */
export function cadenceToMs(cadence: string): number | null {
  const m = cadence.trim().match(/^(\d+)\s*([mhd])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]!.toLowerCase();
  const mult = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

export function nextRunFrom(fromMs: number, cadence: string): number {
  const ms = cadenceToMs(cadence);
  // Unparseable cadence → park it ~1h out so a typo doesn't busy-fire.
  return fromMs + (ms ?? 3_600_000);
}

export function createSchedule(
  db: DB,
  input: { cwd: string; prompt: string; cadence: string; name?: string },
): ScheduledTask {
  const project = ensureProject(db, input.cwd);
  const id = nanoid(8);
  const ts = now();
  const nextRun = nextRunFrom(ts, input.cadence);
  db.prepare(
    `INSERT INTO scheduled_tasks
       (id, project_id, cwd, name, prompt, cron, enabled, last_run_at, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?)`,
  ).run(id, project.id, input.cwd, input.name ?? null, input.prompt, input.cadence, nextRun);
  return getSchedule(db, id)!;
}

export function getSchedule(db: DB, id: string): ScheduledTask | null {
  const row = db
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduleRow | undefined;
  return row ? rowToSchedule(row) : null;
}

export function listSchedules(db: DB): ScheduledTask[] {
  const rows = db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC')
    .all() as ScheduleRow[];
  return rows.map(rowToSchedule);
}

/** Schedules whose next run is due (enabled + next_run_at <= now). */
export function listDueSchedules(db: DB, asOf: number): ScheduledTask[] {
  const rows = db
    .prepare(
      `SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at <= ?`,
    )
    .all(asOf) as ScheduleRow[];
  return rows.map(rowToSchedule);
}

export function setScheduleEnabled(
  db: DB,
  id: string,
  enabled: boolean,
): ScheduledTask | null {
  db.prepare('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    id,
  );
  return getSchedule(db, id);
}

/** Record a fire: set last_run_at = now and advance next_run_at. */
export function markScheduleRun(db: DB, id: string): ScheduledTask | null {
  const sched = getSchedule(db, id);
  if (!sched) return null;
  const ts = now();
  const next = nextRunFrom(ts, sched.cron);
  db.prepare(
    'UPDATE scheduled_tasks SET last_run_at = ?, next_run_at = ? WHERE id = ?',
  ).run(ts, next, id);
  return getSchedule(db, id);
}

export function deleteSchedule(db: DB, id: string): boolean {
  const res = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
  return res.changes > 0;
}
