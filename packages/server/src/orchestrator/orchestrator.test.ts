import { describe, it, expect, beforeEach } from 'vitest';
import type { ServerMessage } from '@solix/shared';
import { resetDbForTests, type DB } from '../db.js';
import { ensureProject } from '../state/projects.js';
import { updatePlanTask } from '../state/plans.js';
import {
  getSession,
  setSessionCost,
  setSessionStatus,
  upsertSession,
} from '../state/sessions.js';
import { Orchestrator } from './index.js';
import type { RunOnceOpts, RunOnceResult, SessionRunner } from './runner.js';

class FakeRunner implements SessionRunner {
  constructor(private result: RunOnceResult) {}
  runOnce(): Promise<RunOnceResult> {
    return Promise.resolve(this.result);
  }
}

const PLAN_JSON = JSON.stringify({
  name: 'Ship login',
  tasks: [
    {
      id: 't1',
      title: 'Build form',
      prompt: 'Create the login form',
      acceptanceCriteria: 'Form renders email + password',
      dependsOn: [],
      assignedAdvisorRole: 'forge',
    },
    {
      id: 't2',
      title: 'Review',
      prompt: 'Review it',
      acceptanceCriteria: 'No critical issues',
      dependsOn: ['t1'],
      assignedAdvisorRole: 'argus',
    },
  ],
});

function makeOrchestrator(db: DB, runResult: RunOnceResult, autoMode = false) {
  const msgs: ServerMessage[] = [];
  const orch = new Orchestrator({
    db,
    runner: new FakeRunner(runResult),
    broadcast: (m) => msgs.push(m),
    getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
    knownModels: ['opus', 'sonnet', 'haiku', 'default'],
    getMaestroPrompt: () => 'MAESTRO PROMPT',
    fullAutoStatus: () => ({ ok: true, reasons: [] }), // containment satisfied
  });
  return { orch, msgs, autoMode };
}

describe('Orchestrator.createPlanFromGoal', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('runs the planner, persists a plan + tasks, parks at awaiting_approval', async () => {
    const { orch, msgs } = makeOrchestrator(db, { ok: true, output: PLAN_JSON });
    const res = await orch.createPlanFromGoal({ goal: 'add login', cwd: '/tmp/p' });

    expect(res.ok).toBe(true);
    const bundle = orch.getPlanWithTasks(res.planId!)!;
    expect(bundle.plan.status).toBe('awaiting_approval');
    expect(bundle.plan.name).toBe('Ship login');
    expect(bundle.tasks).toHaveLength(2);
    expect(bundle.tasks[0]!.assignedAdvisorRole).toBe('forge');
    // dependsOn is remapped from the planner's ids ("t1") to real db ids.
    expect(bundle.tasks[1]!.dependsOn).toEqual([bundle.tasks[0]!.id]);
    // Broadcast a plan_upsert and one task upsert per task.
    expect(msgs.filter((m) => m.type === 'plan_upsert').length).toBeGreaterThanOrEqual(1);
    expect(msgs.filter((m) => m.type === 'plan_task_upsert')).toHaveLength(2);
  });

  it('goes straight to running in autoMode', async () => {
    const { orch } = makeOrchestrator(db, { ok: true, output: PLAN_JSON });
    const res = await orch.createPlanFromGoal({
      goal: 'add login',
      cwd: '/tmp/p',
      autoMode: true,
    });
    expect(orch.getPlanWithTasks(res.planId!)!.plan.status).toBe('running');
  });

  it('refuses full-auto without containment and parks for approval', async () => {
    // Containment not satisfied → autoMode is downgraded to supervised.
    const orch = new Orchestrator({
      db,
      runner: new FakeRunner({ ok: true, output: PLAN_JSON }),
      broadcast: () => {},
      getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
      knownModels: ['opus', 'sonnet', 'haiku', 'default'],
      getMaestroPrompt: () => 'MAESTRO PROMPT',
      fullAutoStatus: () => ({ ok: false, reasons: ['gate off'] }),
    });
    const res = await orch.createPlanFromGoal({
      goal: 'add login',
      cwd: '/tmp/p',
      autoMode: true,
    });
    const bundle = orch.getPlanWithTasks(res.planId!)!;
    expect(bundle.plan.status).toBe('awaiting_approval');
    expect(bundle.plan.autoMode).toBe(false);
    expect(res.warnings?.some((w) => w.includes('Full-auto refused'))).toBe(true);
  });

  it('marks the plan failed when the planner output is unparseable', async () => {
    const { orch } = makeOrchestrator(db, { ok: true, output: 'no json here' });
    const res = await orch.createPlanFromGoal({ goal: 'x', cwd: '/tmp/p' });
    expect(res.ok).toBe(false);
    expect(res.errors?.length).toBeGreaterThan(0);
    expect(orch.getPlanWithTasks(res.planId!)!.plan.status).toBe('failed');
    expect(orch.getPlanWithTasks(res.planId!)!.tasks).toHaveLength(0);
  });

  it('marks the plan failed when the planner session itself fails', async () => {
    const { orch } = makeOrchestrator(db, { ok: false, output: '', error: 'no claude' });
    const res = await orch.createPlanFromGoal({ goal: 'x', cwd: '/tmp/p' });
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(['no claude']);
    expect(orch.getPlanWithTasks(res.planId!)!.plan.status).toBe('failed');
  });
});

describe('Orchestrator.approvePlan', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('advances an awaiting_approval plan to running', async () => {
    const { orch } = makeOrchestrator(db, { ok: true, output: PLAN_JSON });
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    expect(orch.approvePlan(planId!)).toEqual({ ok: true });
    expect(orch.getPlanWithTasks(planId!)!.plan.status).toBe('running');
  });

  it('is a no-op error on a plan that is not awaiting approval', async () => {
    const { orch } = makeOrchestrator(db, { ok: true, output: PLAN_JSON });
    const { planId } = await orch.createPlanFromGoal({
      goal: 'g',
      cwd: '/tmp/p',
      autoMode: true, // already running
    });
    const r = orch.approvePlan(planId!);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not awaiting_approval/);
  });

  it('errors on an unknown plan id', () => {
    const { orch } = makeOrchestrator(db, { ok: true, output: PLAN_JSON });
    expect(orch.approvePlan('nope').ok).toBe(false);
  });
});

// Role-aware fake: planner returns the plan, workers "do the work", the
// verifier passes or fails per config — so the whole dispatch loop runs in CI
// with no real claude.
class RoleFakeRunner implements SessionRunner {
  constructor(
    private cfg: { plan: string; verifierPass: boolean },
  ) {}
  runOnce(o: RunOnceOpts): Promise<RunOnceResult> {
    if (o.role === 'planner') {
      return Promise.resolve({ ok: true, output: this.cfg.plan });
    }
    if (o.role === 'verifier') {
      return Promise.resolve({
        ok: true,
        output: JSON.stringify({ pass: this.cfg.verifierPass, reason: 'r' }),
      });
    }
    return Promise.resolve({ ok: true, output: 'worker done' });
  }
}

function makeDispatchOrchestrator(db: DB, verifierPass: boolean) {
  return new Orchestrator({
    db,
    runner: new RoleFakeRunner({ plan: PLAN_JSON, verifierPass }),
    broadcast: () => {},
    getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
    knownModels: ['opus', 'sonnet', 'haiku', 'default'],
    getMaestroPrompt: () => 'MAESTRO PROMPT',
    fullAutoStatus: () => ({ ok: true, reasons: [] }),
  });
}

describe('Orchestrator dispatch (advance)', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('runs a plan to completion when every task verifies', async () => {
    const orch = makeDispatchOrchestrator(db, true);
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    orch.approvePlan(planId!);
    await orch.advance(planId!); // awaitable → runs to completion

    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('completed');
    expect(b.tasks.map((t) => t.status)).toEqual(['completed', 'completed']);
    // Each task got a worker + a verifier session row (a planet).
    for (const t of b.tasks) {
      expect(t.sessionId).toBeTruthy();
      expect(t.verifierSessionId).toBeTruthy();
    }
  });

  it('retries a failing task up to maxAttempts, then escalates and fails the plan', async () => {
    const orch = makeDispatchOrchestrator(db, false); // verifier always fails
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    orch.approvePlan(planId!);
    await orch.advance(planId!);

    const b = orch.getPlanWithTasks(planId!)!;
    const t1 = b.tasks.find((t) => t.title === 'Build form')!;
    const t2 = b.tasks.find((t) => t.title === 'Review')!;
    expect(t1.status).toBe('escalated');
    expect(t1.attempts).toBe(t1.maxAttempts); // exhausted its retries
    expect(t2.status).toBe('blocked'); // dependency escalated
    expect(b.plan.status).toBe('failed');
  });

  it('does nothing for a plan still awaiting approval', async () => {
    const orch = makeDispatchOrchestrator(db, true);
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    await orch.advance(planId!); // not approved → no dispatch
    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('awaiting_approval');
    expect(b.tasks.every((t) => t.status === 'pending')).toBe(true);
  });

  it('pauses at the budget cap instead of dispatching', async () => {
    const orch = makeDispatchOrchestrator(db, true);
    const { planId } = await orch.createPlanFromGoal({
      goal: 'g',
      cwd: '/tmp/p',
      budgetUsd: 1,
    });
    orch.approvePlan(planId!);
    // Simulate prior spend on this plan at/over the cap (keyed by plan_id).
    const project = ensureProject(db, '/tmp/p');
    upsertSession(db, {
      id: 'seed-1',
      pid: 0,
      projectId: project.id,
      cwd: '/tmp/p',
      origin: 'internal',
      model: 'default',
      kind: 'user',
      planId: planId!,
    });
    setSessionCost(db, 'seed-1', 2);

    await orch.advance(planId!);

    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('paused');
    // No task was dispatched — they stay pending/ready.
    expect(
      b.tasks.every((t) => t.status === 'pending' || t.status === 'ready'),
    ).toBe(true);
  });
});

// A worker that blocks until the plan is aborted, so we can test the kill-switch
// mid-flight. Planner + verifier resolve immediately.
class AbortableWorkerRunner implements SessionRunner {
  runOnce(o: RunOnceOpts): Promise<RunOnceResult> {
    if (o.role === 'planner') return Promise.resolve({ ok: true, output: PLAN_JSON });
    if (o.role === 'verifier') {
      return Promise.resolve({
        ok: true,
        output: JSON.stringify({ pass: true, reason: 'r' }),
      });
    }
    return new Promise((resolve) => {
      const done = (): void =>
        resolve({ ok: false, output: '', error: 'aborted' });
      if (o.signal?.aborted) done();
      else o.signal?.addEventListener('abort', done, { once: true });
    });
  }
}

describe('Orchestrator abort (kill-switch)', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('aborts an in-flight plan, pauses it, and parks the task', async () => {
    const orch = new Orchestrator({
      db,
      runner: new AbortableWorkerRunner(),
      broadcast: () => {},
      getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
      knownModels: ['opus', 'sonnet', 'haiku', 'default'],
      getMaestroPrompt: () => 'MAESTRO PROMPT',
    });
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    orch.approvePlan(planId!);

    const running = orch.advance(planId!); // worker hangs until aborted
    await new Promise((r) => setImmediate(r)); // let the worker go in-flight
    expect(orch.abortPlan(planId!)).toEqual({ ok: true });
    await running;

    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('paused');
    const t1 = b.tasks.find((t) => t.title === 'Build form')!;
    expect(t1.status).toBe('pending'); // parked, not escalated
  });

  it('errors on an unknown plan id', () => {
    const orch = new Orchestrator({
      db,
      runner: new AbortableWorkerRunner(),
      broadcast: () => {},
      getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
      knownModels: ['opus', 'sonnet', 'haiku', 'default'],
      getMaestroPrompt: () => 'MAESTRO PROMPT',
    });
    expect(orch.abortPlan('nope').ok).toBe(false);
  });
});

const SINGLE_TASK_PLAN = JSON.stringify({
  name: 'One',
  tasks: [
    {
      id: 't1',
      title: 'Only',
      prompt: 'do the thing',
      acceptanceCriteria: 'the thing is done',
      dependsOn: [],
    },
  ],
});

// Captures every worker prompt and always fails verification, so we can assert
// the retry carries the prior rejection reason.
class FeedbackCaptureRunner implements SessionRunner {
  workerPrompts: string[] = [];
  constructor(private readonly verifierReason: string) {}
  runOnce(o: RunOnceOpts): Promise<RunOnceResult> {
    if (o.role === 'planner')
      return Promise.resolve({ ok: true, output: SINGLE_TASK_PLAN });
    if (o.role === 'verifier')
      return Promise.resolve({
        ok: true,
        output: JSON.stringify({ pass: false, reason: this.verifierReason }),
      });
    this.workerPrompts.push(o.prompt);
    return Promise.resolve({ ok: true, output: 'worker done' });
  }
}

describe('Orchestrator retry feedback', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('feeds the prior rejection reason into the retry prompt', async () => {
    const runner = new FeedbackCaptureRunner('the submit button is missing');
    const orch = new Orchestrator({
      db,
      runner,
      broadcast: () => {},
      getKnownAdvisorRoles: () => ['forge', 'argus', 'mira'],
      knownModels: ['opus', 'sonnet', 'haiku', 'default'],
      getMaestroPrompt: () => 'MAESTRO PROMPT',
    });
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    orch.approvePlan(planId!);
    await orch.advance(planId!);

    // maxAttempts=3 → three worker dispatches; attempts 2+ carry the feedback.
    expect(runner.workerPrompts).toHaveLength(3);
    expect(runner.workerPrompts[0]).not.toContain('PREVIOUS ATTEMPT');
    expect(runner.workerPrompts[1]).toContain('the submit button is missing');
    expect(runner.workerPrompts[2]).toContain('the submit button is missing');

    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.tasks[0]!.status).toBe('escalated');
    expect(b.tasks[0]!.lastError).toContain('the submit button is missing');
  });
});

describe('Orchestrator.reconcile', () => {
  let db: DB;
  beforeEach(() => {
    db = resetDbForTests();
  });

  it('resumes a plan orphaned mid-dispatch and terminates the dead planet', async () => {
    const orch = makeDispatchOrchestrator(db, true);
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    orch.approvePlan(planId!);

    // Simulate a crash: the first task is stuck `dispatched` with a live worker
    // row, exactly as a killed process would leave the DB.
    const t1 = orch.getPlanWithTasks(planId!)!.tasks[0]!;
    const project = ensureProject(db, '/tmp/p');
    upsertSession(db, {
      id: 'orphan-w',
      pid: 0,
      projectId: project.id,
      cwd: '/tmp/p',
      origin: 'internal',
      model: 'default',
      kind: 'user',
      planId: planId!,
      planTaskId: t1.id,
      sessionRole: 'worker',
    });
    setSessionStatus(db, 'orphan-w', 'active');
    updatePlanTask(db, t1.id, {
      status: 'dispatched',
      attempts: 1,
      sessionId: 'orphan-w',
    });

    await orch.reconcile();

    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('completed');
    expect(b.tasks.every((t) => t.status === 'completed')).toBe(true);
    // The orphaned worker planet was cleaned up.
    expect(getSession(db, 'orphan-w')!.status).toBe('terminated');
  });

  it('does nothing to a plan that is not running', async () => {
    const orch = makeDispatchOrchestrator(db, true);
    const { planId } = await orch.createPlanFromGoal({ goal: 'g', cwd: '/tmp/p' });
    // Left at awaiting_approval — reconcile must not touch it.
    await orch.reconcile();
    const b = orch.getPlanWithTasks(planId!)!;
    expect(b.plan.status).toBe('awaiting_approval');
    expect(b.tasks.every((t) => t.status === 'pending')).toBe(true);
  });
});
