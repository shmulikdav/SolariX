import { createSolixServer } from '@solix/server/create';
import open from 'open';

// Injected at build time by tsup (same define as index.ts). Lets the
// server report the real product version at /api/health instead of a
// stale hardcoded literal.
declare const __SOLIX_VERSION__: string;

export interface StartOptions {
  port?: number;
  noOpen?: boolean;
}

// Standard FIGlet font, S O L I X. The previous banner accidentally
// drew an "M" as the last letter (SOLIM) — corrected here.
const BANNER = `
   ____   ___  _     ___ __  __
  / ___| / _ \\| |   |_ _|\\ \\/ /
  \\___ \\| | | | |    | |  \\  /
   ___) | |_| | |___ | |  /  \\
  |____/ \\___/|_____|___|/_/\\_\\

  a solar-system command center for Claude Code
`;

export async function start(opts: StartOptions = {}): Promise<void> {
  const port = opts.port ?? Number(process.env.SOLIX_PORT ?? 4242);
  console.log(BANNER);
  const handle = await createSolixServer({ port, version: __SOLIX_VERSION__ });
  const url = `http://${handle.hostname}:${handle.port}`;
  console.log(`[solix] server listening on ${url}`);
  console.log(`[solix] events  -> POST ${url}/events`);
  console.log(`[solix] ws      -> ws://${handle.hostname}:${handle.port}/ws`);
  if (!opts.noOpen) {
    try {
      await open(url);
    } catch {
      console.log(`[solix] open ${url} in your browser to view`);
    }
  }
  console.log(
    '[solix] start any `claude` session to see your first planet appear',
  );

  const shutdown = async (sig: string): Promise<void> => {
    console.log(`\n[solix] ${sig} — shutting down`);
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
