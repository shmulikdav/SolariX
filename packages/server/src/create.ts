import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Broadcaster } from './broadcaster.js';
import { getDb } from './db.js';
import { createHttpApp } from './http.js';
import { Launcher } from './launcher.js';
import { DB_PATH } from './paths.js';
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
  // Boot diagnostic — prints the actual DB file the server opened plus the
  // row counts it found, so a user reporting "my data is gone" can confirm
  // in one log line whether the running process is reading the expected
  // ~/.solix/solix.db or a different one (stale global install, custom
  // SOLIX_HOME, wrong cwd, etc.).
  const advisorCount = (
    db.prepare('SELECT count(*) AS n FROM advisors').get() as { n: number }
  ).n;
  const sessionCount = (
    db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }
  ).n;
  console.log(
    `[solix] db      -> ${DB_PATH} (advisors=${advisorCount}, sessions=${sessionCount})`,
  );
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

  const app = createHttpApp({ db, router, token });

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
  // launcher. The schedule's next_run_at is bumped by 60s to throttle
  // re-fires if the launch itself fails (e.g. claude not on PATH).
  const scheduleTimer = setInterval(() => {
    const due = listDueSchedules(db, now());
    for (const s of due) {
      const project = db
        .prepare('SELECT cwd FROM projects WHERE id = ?')
        .get(s.projectId) as { cwd?: string } | undefined;
      if (!project?.cwd) continue;
      const launched = router.launchInternalSession({
        cwd: project.cwd,
        initialPrompt: s.prompt,
      });
      if (launched.ok) {
        markScheduleRun(db, s.id);
        router.broadcastScheduleUpsert({
          ...s,
          lastRunAt: now(),
          nextRunAt: now() + 60_000,
        });
      }
    }
  }, 30_000);

  return {
    port,
    hostname,
    close: async () => {
      clearInterval(scheduleTimer);
      stopAgentViewBridge?.();
      transcripts.stopAll();
      router.setLauncher(undefined as never);
      await new Promise<void>((resolve) => {
        if (typeof (server as { close?: () => void }).close === 'function') {
          (server as unknown as { close: (cb: () => void) => void }).close(
            () => resolve(),
          );
        } else {
          resolve();
        }
      });
      launcher.shutdown();
    },
  };
}
