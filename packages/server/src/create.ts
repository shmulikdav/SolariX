import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Broadcaster } from './broadcaster.js';
import { getDb } from './db.js';
import { createHttpApp } from './http.js';
import { Launcher } from './launcher.js';
import { EventRouter } from './router.js';
import { attachWs } from './ws.js';
import { seedAdvisors } from './state/advisors.js';
import { discoverSkills } from './state/skills.js';
import { TranscriptWatcherManager } from './state/transcript.js';
import { cleanupOrphanedSockets } from './state/wrappers.js';
import { startAgentViewBridge } from './state/agentview.js';
import { listDueSchedules, markScheduleRun } from './state/schedules.js';
import { now } from './util.js';

export interface SolixServerOptions {
  port?: number;
  hostname?: string;
  /** Product version, surfaced at /api/health. The CLI passes its own
   * package version; defaults to "unknown" when embedded directly. */
  version?: string;
}

export interface SolixServerHandle {
  port: number;
  hostname: string;
  close: () => Promise<void>;
}

export async function createSolixServer(
  opts: SolixServerOptions = {},
): Promise<SolixServerHandle> {
  const port = opts.port ?? 4242;
  const hostname = opts.hostname ?? '127.0.0.1';

  const db = getDb();
  seedAdvisors(db);
  discoverSkills(db);
  // Stale `solix run` wrappers (from a previous server lifetime) leave
  // their .sock files behind. Clear them up front so the directory
  // doesn't grow unbounded across restarts. Also null any stored
  // wrapper_socket_path on sessions — wrappers don't survive a restart.
  const cleared = cleanupOrphanedSockets();
  if (cleared > 0) {
    console.log(`[solix] cleaned up ${cleared} orphaned wrapper socket(s)`);
  }
  db.prepare(
    `UPDATE sessions SET wrapper_socket_path = NULL WHERE wrapper_socket_path IS NOT NULL`,
  ).run();
  const broadcaster = new Broadcaster();
  const launcher = new Launcher(db, broadcaster);
  const transcripts = new TranscriptWatcherManager(db, broadcaster);
  const router = new EventRouter(db, broadcaster, launcher, transcripts);

  // Shared secret written by `solix install`. When present, the server
  // requires it on the spoofable /events ingestion surface. Absent (e.g. an
  // older install that predates the token) → no enforcement, same as before.
  const tokenPath = join(
    process.env.SOLIX_HOME ?? join(homedir(), '.solix'),
    'token',
  );
  let token: string | null = null;
  try {
    token = readFileSync(tokenPath, 'utf8').trim() || null;
  } catch {
    token = null;
  }

  const app = createHttpApp({ db, router, token, version: opts.version });

  const server = serve({
    fetch: app.fetch,
    port,
    hostname,
  });

  attachWs(server as unknown as import('node:http').Server, {
    db,
    router,
    broadcaster,
  });

  // Sprint L: bridge to Anthropic's Agent View. Reads ~/.claude/daemon
  // + ~/.claude/jobs to mirror background sessions managed by the
  // claude-agents supervisor into Solix. No-op if Agent View isn't
  // installed locally.
  const stopAgentViewBridge = startAgentViewBridge({ db, broadcaster });

  // Sprint M — heartbeat scheduler. Every ~30s, fire any enabled schedule
  // whose next_run_at has passed by launching it through the normal internal
  // launch path, then advance its next_run_at.
  const scheduleTimer = setInterval(() => {
    try {
      const due = listDueSchedules(db, now());
      for (const s of due) {
        if (!s.cwd) continue;
        launcher.launch({ cwd: s.cwd, initialPrompt: s.prompt });
        const updated = markScheduleRun(db, s.id);
        if (updated) {
          broadcaster.broadcast({ type: 'schedule_upsert', schedule: updated });
          broadcaster.broadcast({
            type: 'toast',
            level: 'info',
            message: `Heartbeat fired: ${s.name ?? s.prompt.slice(0, 32)}`,
          });
        }
      }
    } catch (err) {
      console.warn('[scheduler] tick failed:', (err as Error).message);
    }
  }, 30_000);

  return {
    port,
    hostname,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(scheduleTimer);
        stopAgentViewBridge();
        transcripts.shutdownAll();
        launcher.shutdownAll();
        server.close(() => resolve());
      }),
  };
}
