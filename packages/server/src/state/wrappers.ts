import { connect } from 'node:net';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * In-memory registry of `solix run` wrappers (Sprint J). When a user
 * starts a session via `solix run` instead of bare `claude`, the
 * wrapper POSTs `/api/wrappers/register` with the path to its Unix
 * socket. We then correlate the registration with the SessionStart
 * hook (by cwd, with a freshness window) and persist
 * `session.wrapper_socket_path` so the SidePanel composer can write
 * prompts back through the socket.
 *
 * Records are ephemeral — wrappers come and go with their claude
 * children, and registrations don't outlive process lifetime.
 */
export interface WrapperRecord {
  wrapperId: string;
  socketPath: string;
  cwd: string;
  registeredAt: number;
}

const wrappers = new Map<string, WrapperRecord>();

/** Reverse index: once `claimWrapperForCwd` resolves a wrapper to a real
 * session, we remember the binding. On unregister we use it to clear
 * `session.wrapper_socket_path` so the SidePanel composer reverts to
 * read-only when claude exits. */
const wrapperToSession = new Map<string, string>();

/** How fresh a wrapper registration needs to be for SessionStart to
 * claim it. Generous because some shells take a moment to fire the
 * session_start hook after `claude` actually launches. */
const FRESHNESS_WINDOW_MS = 60_000;

export function registerWrapper(rec: WrapperRecord): void {
  wrappers.set(rec.wrapperId, rec);
}

export function unregisterWrapper(wrapperId: string): string | undefined {
  wrappers.delete(wrapperId);
  const sessionId = wrapperToSession.get(wrapperId);
  wrapperToSession.delete(wrapperId);
  return sessionId;
}

export function bindWrapperToSession(
  wrapperId: string,
  sessionId: string,
): void {
  wrapperToSession.set(wrapperId, sessionId);
}

export function getSessionForWrapper(wrapperId: string): string | undefined {
  return wrapperToSession.get(wrapperId);
}

export function listWrappers(): WrapperRecord[] {
  return [...wrappers.values()];
}

/**
 * Boot-time sweep of orphaned `.sock` files in ~/.solix/wrappers/. If
 * `solix run` was killed (e.g. kill -9) the socket file persists but
 * nothing's listening; the directory accumulates them. Called once
 * during server startup.
 */
export function cleanupOrphanedSockets(): number {
  const dir = join(homedir(), '.solix', 'wrappers');
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sock')) continue;
    try {
      unlinkSync(join(dir, f));
      removed++;
    } catch {
      /* ignore — file might already be gone */
    }
  }
  return removed;
}

/** Find the most recently-registered wrapper for `cwd`, if it's
 * within the freshness window. Used by router.onSessionStart to
 * decide whether the new session should be marked as wrapped. */
export function claimWrapperForCwd(cwd: string): WrapperRecord | undefined {
  const now = Date.now();
  let best: WrapperRecord | undefined;
  for (const rec of wrappers.values()) {
    if (rec.cwd !== cwd) continue;
    if (now - rec.registeredAt > FRESHNESS_WINDOW_MS) continue;
    if (!best || rec.registeredAt > best.registeredAt) best = rec;
  }
  if (best) {
    // Clear from registry so a sibling SessionStart in the same cwd
    // doesn't re-claim the same wrapper.
    wrappers.delete(best.wrapperId);
  }
  return best;
}

/**
 * Connect briefly to a wrapper's Unix socket and ship one prompt
 * frame. Pre-checks that the socket file exists so a dead wrapper
 * surfaces as a clear `false` instead of being swallowed by an async
 * `client.on('error')`. The wrapper writes the text to the
 * underlying claude PTY's stdin.
 */
export function writeToWrapperSocket(
  socketPath: string,
  text: string,
): boolean {
  if (!existsSync(socketPath)) return false;
  try {
    const client = connect(socketPath);
    client.on('error', () => {
      try {
        client.destroy();
      } catch {
        /* ignore */
      }
    });
    client.write(JSON.stringify({ type: 'send_prompt', text }) + '\n');
    client.end();
    return true;
  } catch {
    return false;
  }
}
