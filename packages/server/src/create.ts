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

  return {
    port,
    hostname,
    close: () =>
      new Promise<void>((resolve) => {
        transcripts.shutdownAll();
        launcher.shutdownAll();
        server.close(() => resolve());
      }),
  };
}
