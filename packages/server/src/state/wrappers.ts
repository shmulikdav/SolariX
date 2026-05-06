import { connect } from 'node:net';

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

/** How fresh a wrapper registration needs to be for SessionStart to
 * claim it. Generous because some shells take a moment to fire the
 * session_start hook after `claude` actually launches. */
const FRESHNESS_WINDOW_MS = 60_000;

export function registerWrapper(rec: WrapperRecord): void {
  wrappers.set(rec.wrapperId, rec);
}

export function unregisterWrapper(wrapperId: string): void {
  wrappers.delete(wrapperId);
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
 * frame. Returns true if the write was at least attempted. The
 * wrapper writes the text to the underlying claude PTY's stdin.
 */
export function writeToWrapperSocket(
  socketPath: string,
  text: string,
): boolean {
  try {
    const client = connect(socketPath);
    let settled = false;
    client.on('error', () => {
      // Wrapper exited or socket file stale. Caller already returned
      // true; the worst case is a silent drop, which is OK because
      // the user can see in the UI that no response came back.
      if (!settled) {
        settled = true;
        try {
          client.destroy();
        } catch {
          /* ignore */
        }
      }
    });
    client.write(JSON.stringify({ type: 'send_prompt', text }) + '\n');
    client.end();
    settled = true;
    return true;
  } catch {
    return false;
  }
}
