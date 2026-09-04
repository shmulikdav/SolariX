import { beforeEach, describe, expect, it } from 'vitest';
import type { HookEvent } from '@solix/shared';
import { resetDbForTests, type DB } from './db.js';
import { Broadcaster } from './broadcaster.js';
import { EventRouter } from './router.js';
import { ensureProject } from './state/projects.js';
import { upsertSession } from './state/sessions.js';
import { listAudit } from './state/audit.js';

/**
 * Integration proof that the containment gate hard-denies an autonomous worker's
 * denylisted tool call — resolving `requestPermission` immediately with no human
 * and no timeout, so full-auto cannot degrade to auto-allow.
 */
function bashEvent(sessionId: string, command: string): HookEvent {
  return {
    event: 'pre_tool_bash',
    pid: 0,
    cwd: '/srv/project',
    ts: Date.now(),
    payload: { session_id: sessionId, tool_name: 'Bash', command },
  } as HookEvent;
}

describe('router containment gate', () => {
  let db: DB;
  let router: EventRouter;
  beforeEach(() => {
    db = resetDbForTests();
    router = new EventRouter(db, new Broadcaster());
  });

  function seedWorker(id: string): void {
    const project = ensureProject(db, '/srv/project');
    upsertSession(db, {
      id,
      pid: 0,
      projectId: project.id,
      cwd: '/srv/project',
      origin: 'internal',
      model: 'default',
      kind: 'user',
      sessionRole: 'worker',
    });
  }

  it('hard-denies a worker running a denylisted command (no human, no timeout)', async () => {
    seedWorker('w1');
    const res = await router.requestPermission(bashEvent('w1', 'rm -rf /'));
    expect(res).toEqual({ approved: false, timedOut: false });
    // It never entered the human gate…
    expect(router.pendingPermissions()).toHaveLength(0);
    // …and it was audited as a denial.
    expect(
      listAudit(db).some(
        (a) => a.kind === 'permission_denied' && a.summary.includes('Containment'),
      ),
    ).toBe(true);
  });

  it('does not auto-resolve a worker running a safe command (enters the gate)', async () => {
    seedWorker('w2');
    const perm = router.requestPermission(bashEvent('w2', 'npm test'));
    await new Promise((r) => setImmediate(r)); // let the sync path run
    const pendings = router.pendingPermissions();
    expect(pendings).toHaveLength(1); // a safe command awaits a human
    expect(pendings[0]!.tool).toBe('Bash');
    // Resolve it so the pending timer is cleared and nothing lingers.
    router.resolvePermission(pendings[0]!.requestId, false);
    expect((await perm).approved).toBe(false);
  });
});
