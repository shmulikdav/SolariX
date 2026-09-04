import { describe, it, expect, beforeEach } from 'vitest';
import type { ServerMessage } from '@solix/shared';
import { resetDbForTests, type DB } from '../db.js';
import { Orchestrator } from './index.js';
import type { RunOnceResult, SessionRunner } from './runner.js';

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
    expect(bundle.tasks[1]!.dependsOn).toEqual(['t1']);
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
