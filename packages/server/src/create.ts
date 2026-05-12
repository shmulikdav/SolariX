import { serve } from '@hono/node-server';
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
  const broadcaster = new Broadcaster();
  const launcher = new Launcher(db, broadcaster);
  const transcripts = new TranscriptWatcherManager(db, broadcaster);
  const router = new EventRouter(db, broadcaster, launcher, transcripts);
  const app = createHttpApp({ db, router });

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

  return {
    port,
    hostname,
    close: () =>
      new Promise<void>((resolve) => {
        stopAgentViewBridge();
        transcripts.shutdownAll();
        launcher.shutdownAll();
        server.close(() => resolve());
      }),
  };
}
