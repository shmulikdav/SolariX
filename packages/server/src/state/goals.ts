import { nanoid } from 'nanoid';
import type { Goal } from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';

interface GoalRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: number;
}

// A small palette so each new goal gets a distinct constellation color.
const PALETTE = [
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#f87171', // red
  '#22d3ee', // cyan
  '#c084fc', // purple
];

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color,
    createdAt: row.created_at,
  };
}

function nextColor(db: DB): string {
  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM goals').get() as { n: number }
  ).n;
  return PALETTE[count % PALETTE.length]!;
}

export function createGoal(
  db: DB,
  input: { name: string; description?: string; color?: string },
): Goal {
  const id = nanoid(8);
  const ts = now();
  const color = input.color ?? nextColor(db);
  db.prepare(
    `INSERT INTO goals (id, name, description, color, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.description ?? null, color, ts);
  return { id, name: input.name, description: input.description, color, createdAt: ts };
}

export function listGoals(db: DB): Goal[] {
  const rows = db
    .prepare('SELECT * FROM goals ORDER BY created_at ASC')
    .all() as GoalRow[];
  return rows.map(rowToGoal);
}

export function getGoal(db: DB, id: string): Goal | null {
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as
    | GoalRow
    | undefined;
  return row ? rowToGoal(row) : null;
}

export function deleteGoal(db: DB, id: string): boolean {
  // Detach the goal from any sessions/missions still pointing at it so the
  // constellation lines disappear cleanly.
  db.prepare(
    `UPDATE sessions SET current_goal_id = NULL WHERE current_goal_id = ?`,
  ).run(id);
  db.prepare(`UPDATE missions SET goal_id = NULL WHERE goal_id = ?`).run(id);
  const res = db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  return res.changes > 0;
}
