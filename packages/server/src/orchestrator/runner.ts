import type { Model, SessionRole } from '@solix/shared';

/**
 * The narrow capability the Orchestrator depends on to run a Claude session —
 * NOT the concrete `Launcher`. This is the seam that makes the orchestrator
 * unit-testable: production wires a launcher-backed implementation; tests pass a
 * fake that returns canned output. (Mira's review.)
 */

export interface RunOnceOpts {
  cwd: string;
  prompt: string;
  model?: Model;
  role: SessionRole;
  /** Pre-allocated session id (Phase 2 dispatch pre-creates the planet row so
   *  the worker↔task correlation is deterministic, not cwd-keyed). Optional for
   *  the Phase-1 planner, which is a transient one-shot. */
  sessionId?: string;
}

export interface RunOnceResult {
  ok: boolean;
  /** The session's captured stdout (e.g. the planner's JSON, a worker's diff). */
  output: string;
  sessionId?: string;
  error?: string;
}

export interface SessionRunner {
  /**
   * Run a one-shot `claude --print` session to completion and resolve with its
   * captured stdout. Rejects only on truly unexpected errors; a non-zero exit
   * or missing binary resolves with `{ ok: false, error }`.
   */
  runOnce(opts: RunOnceOpts): Promise<RunOnceResult>;
}
