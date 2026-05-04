import { nanoid } from 'nanoid';
import type { ToolCall, ToolCallStatus } from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';

export interface RecordToolCallInput {
  sessionId: string;
  missionId?: string;
  tool: string;
  args?: Record<string, unknown>;
  status?: ToolCallStatus;
}

export function recordToolCall(
  db: DB,
  input: RecordToolCallInput,
): ToolCall {
  const id = nanoid();
  const ts = now();
  const status = input.status ?? 'running';
  db.prepare(
    `INSERT INTO tool_calls (id, session_id, mission_id, tool, args_json, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.sessionId,
    input.missionId ?? null,
    input.tool,
    JSON.stringify(input.args ?? {}),
    status,
    ts,
  );
  return {
    id,
    sessionId: input.sessionId,
    missionId: input.missionId,
    tool: input.tool,
    args: input.args ?? {},
    startedAt: ts,
    status,
  };
}
