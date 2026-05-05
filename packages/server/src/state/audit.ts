import { nanoid } from 'nanoid';
import type { AuditEvent, AuditKind } from '@solix/shared';
import type { DB } from '../db.js';

interface AuditRow {
  id: string;
  ts: number;
  kind: AuditKind;
  session_id: string | null;
  advisor_id: string | null;
  project_id: string | null;
  summary: string;
  payload_json: string | null;
}

function rowToAuditEvent(row: AuditRow): AuditEvent {
  let payload: Record<string, unknown> | undefined;
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    } catch {
      payload = undefined;
    }
  }
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    sessionId: row.session_id ?? undefined,
    advisorId: row.advisor_id ?? undefined,
    projectId: row.project_id ?? undefined,
    summary: row.summary,
    payload,
  };
}

export interface RecordAuditInput {
  kind: AuditKind;
  summary: string;
  sessionId?: string;
  advisorId?: string;
  projectId?: string;
  payload?: Record<string, unknown>;
}

export function recordAudit(db: DB, input: RecordAuditInput): AuditEvent {
  const event: AuditEvent = {
    id: nanoid(),
    ts: Date.now(),
    kind: input.kind,
    sessionId: input.sessionId,
    advisorId: input.advisorId,
    projectId: input.projectId,
    summary: input.summary,
    payload: input.payload,
  };
  db.prepare(
    `INSERT INTO audit_events
       (id, ts, kind, session_id, advisor_id, project_id, summary, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.ts,
    event.kind,
    event.sessionId ?? null,
    event.advisorId ?? null,
    event.projectId ?? null,
    event.summary,
    event.payload ? JSON.stringify(event.payload) : null,
  );
  return event;
}

export interface ListAuditOptions {
  sessionId?: string;
  kind?: AuditKind;
  since?: number;
  until?: number;
  limit?: number;
}

export function listAudit(
  db: DB,
  opts: ListAuditOptions = {},
): AuditEvent[] {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.sessionId) {
    where.push('session_id = ?');
    params.push(opts.sessionId);
  }
  if (opts.kind) {
    where.push('kind = ?');
    params.push(opts.kind);
  }
  if (typeof opts.since === 'number') {
    where.push('ts >= ?');
    params.push(opts.since);
  }
  if (typeof opts.until === 'number') {
    where.push('ts <= ?');
    params.push(opts.until);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM audit_events ${whereClause}
       ORDER BY ts DESC
       LIMIT ?`,
    )
    .all(...params, limit) as AuditRow[];
  return rows.map(rowToAuditEvent);
}
