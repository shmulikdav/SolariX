import { spawn, type ChildProcess } from 'node:child_process';
import { nanoid } from 'nanoid';
import type { DB } from './db.js';
import type { Broadcaster } from './broadcaster.js';
import { ensureProject } from './state/projects.js';
import { upsertSession, setSessionStatus } from './state/sessions.js';
import {
  getAdvisor,
  setAdvisorPinned,
} from './state/advisors.js';

interface PinnedProcess {
  advisorId: string;
  pid: number;
  child?: ChildProcess;
  syntheticSessionId?: string;
}

const FAKE_CLAUDE = process.env.SOLIX_FAKE_CLAUDE === '1';

export class Launcher {
  private byPid = new Map<number, PinnedProcess>();
  private byAdvisor = new Map<string, PinnedProcess>();

  constructor(
    private db: DB,
    private broadcaster: Broadcaster,
  ) {}

  /** Returns the advisor role bound to a given pid, if any. */
  advisorRoleForPid(pid: number): string | undefined {
    return this.byPid.get(pid)?.advisorId;
  }

  /**
   * Pin (spawn) an advisor as an always-on Claude Code session.
   * Returns true if the spawn succeeded (or a synthetic session was created).
   */
  pin(advisorId: string, cwd: string): boolean {
    if (this.byAdvisor.has(advisorId)) return true;
    const advisor = getAdvisor(this.db, advisorId);
    if (!advisor) return false;

    if (FAKE_CLAUDE) {
      return this.pinSynthetic(advisor.id, advisor.codename, cwd);
    }

    try {
      const child = spawn(
        'claude',
        ['--agent', advisor.id, '--no-tty'],
        {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
        },
      );

      const pid = child.pid;
      if (!pid) {
        this.broadcaster.broadcast({
          type: 'toast',
          level: 'error',
          message: `Could not spawn claude for ${advisor.codename}`,
        });
        return false;
      }

      const record: PinnedProcess = { advisorId, pid, child };
      this.byPid.set(pid, record);
      this.byAdvisor.set(advisorId, record);
      setAdvisorPinned(this.db, advisorId, true);

      child.on('exit', () => {
        this.cleanup(advisorId, pid);
      });
      child.on('error', (err) => {
        console.warn(`[launcher] ${advisorId} error:`, err.message);
        this.broadcaster.broadcast({
          type: 'toast',
          level: 'warn',
          message: `${advisor.codename} exited (${err.message})`,
        });
        this.cleanup(advisorId, pid);
      });

      return true;
    } catch (err) {
      console.warn(`[launcher] spawn failed for ${advisorId}:`, err);
      // Fall back to a synthetic session so the visuals still light up;
      // user gets a clear toast about what happened.
      this.broadcaster.broadcast({
        type: 'toast',
        level: 'warn',
        message: `claude binary not found — pinned ${advisor.codename} as synthetic`,
      });
      return this.pinSynthetic(advisor.id, advisor.codename, cwd);
    }
  }

  private pinSynthetic(
    advisorId: string,
    codename: string,
    cwd: string,
  ): boolean {
    const project = ensureProject(this.db, cwd);
    const sessionId = `advisor-${advisorId}-${nanoid(6)}`;
    const fakePid = 100000 + Math.floor(Math.random() * 100000);
    const session = upsertSession(this.db, {
      id: sessionId,
      pid: fakePid,
      projectId: project.id,
      cwd,
      origin: 'internal',
      kind: 'advisor',
      advisorRole: advisorId,
    });
    setSessionStatus(this.db, sessionId, 'idle');
    setAdvisorPinned(this.db, advisorId, true, sessionId);

    const record: PinnedProcess = {
      advisorId,
      pid: fakePid,
      syntheticSessionId: sessionId,
    };
    this.byPid.set(fakePid, record);
    this.byAdvisor.set(advisorId, record);

    this.broadcaster.broadcast({ type: 'session_upsert', session });
    this.broadcaster.broadcast({
      type: 'toast',
      level: 'info',
      message: `${codename} pinned (always-on)`,
    });
    return true;
  }

  unpin(advisorId: string): boolean {
    const record = this.byAdvisor.get(advisorId);
    if (!record) {
      // Nothing to kill, but still flip the DB state.
      setAdvisorPinned(this.db, advisorId, false);
      return true;
    }
    if (record.child) {
      try {
        record.child.kill('SIGTERM');
      } catch (err) {
        console.warn(`[launcher] kill failed for ${advisorId}:`, err);
      }
    }
    this.cleanup(advisorId, record.pid);
    return true;
  }

  private cleanup(advisorId: string, pid: number): void {
    const record = this.byAdvisor.get(advisorId);
    this.byAdvisor.delete(advisorId);
    this.byPid.delete(pid);
    setAdvisorPinned(this.db, advisorId, false);

    if (record?.syntheticSessionId) {
      setSessionStatus(this.db, record.syntheticSessionId, 'terminated');
      this.broadcaster.broadcast({
        type: 'session_remove',
        sessionId: record.syntheticSessionId,
      });
    }
    const advisor = getAdvisor(this.db, advisorId);
    if (advisor) {
      this.broadcaster.broadcast({ type: 'advisor_upsert', advisor });
    }
  }

  shutdownAll(): void {
    for (const advisorId of [...this.byAdvisor.keys()]) {
      this.unpin(advisorId);
    }
  }
}
