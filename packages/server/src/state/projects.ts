import type { Project } from '@solix/shared';
import type { DB } from '../db.js';
import { hashCwd, now, projectNameFromCwd } from '../util.js';

interface ProjectRow {
  id: string;
  cwd: string;
  name: string;
  first_seen_at: number;
  last_active_at: number;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    cwd: row.cwd,
    name: row.name,
    firstSeenAt: row.first_seen_at,
    lastActiveAt: row.last_active_at,
  };
}

export function ensureProject(db: DB, cwd: string): Project {
  const id = hashCwd(cwd);
  const ts = now();
  const existing = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(id) as ProjectRow | undefined;

  if (existing) {
    db.prepare('UPDATE projects SET last_active_at = ? WHERE id = ?').run(
      ts,
      id,
    );
    return rowToProject({ ...existing, last_active_at: ts });
  }

  const name = projectNameFromCwd(cwd);
  db.prepare(
    `INSERT INTO projects (id, cwd, name, first_seen_at, last_active_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, cwd, name, ts, ts);

  return {
    id,
    cwd,
    name,
    firstSeenAt: ts,
    lastActiveAt: ts,
  };
}

export function listProjects(db: DB): Project[] {
  const rows = db
    .prepare('SELECT * FROM projects ORDER BY last_active_at DESC')
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}
