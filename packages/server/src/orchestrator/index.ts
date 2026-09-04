import type { Plan, ServerMessage } from '@solix/shared';
import type { DB } from '../db.js';
import {
  createPlan,
  createPlanTask,
  getPlan,
  listPlanTasks,
  updatePlan,
} from '../state/plans.js';
import { parsePlannerOutput } from './planner.js';
import type { SessionRunner } from './runner.js';

export type { SessionRunner } from './runner.js';

export interface OrchestratorDeps {
  db: DB;
  runner: SessionRunner;
  /** Fan a server message out to connected clients (broadcaster.broadcast in
   *  prod; a recording spy in tests). */
  broadcast: (msg: ServerMessage) => void;
  /** Advisor roles that exist right now (for allowlisting planner output). */
  getKnownAdvisorRoles: () => string[];
  /** Model ids/aliases the launcher accepts. */
  knownModels: string[];
  /** The Maestro planner system prompt (maestro.md body). */
  getMaestroPrompt: () => string;
}

export interface CreatePlanInput {
  goal: string;
  cwd: string;
  name?: string;
  autoMode?: boolean;
  goalId?: string;
  budgetUsd?: number;
}

export interface CreatePlanResult {
  ok: boolean;
  planId?: string;
  errors?: string[];
  warnings?: string[];
}

/**
 * The Maestro orchestrator. Phase 1 scope: turn a goal into an approved plan.
 * It runs a planner session (via the injected SessionRunner), parses + validates
 * the JSON into a Plan + PlanTasks, and parks it at `awaiting_approval` for a
 * one-click human approve (or `running` in autoMode). **No dispatch yet** —
 * `approvePlan` only flips status; Phase 2 wires the actual worker fan-out.
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private emitPlan(plan: Plan): void {
    this.deps.broadcast({ type: 'plan_upsert', plan });
  }

  async createPlanFromGoal(input: CreatePlanInput): Promise<CreatePlanResult> {
    const { db, runner, broadcast } = this.deps;

    // 1. Persist a draft plan immediately so the UI shows "planning…".
    let plan = createPlan(db, {
      name: input.name?.trim() || input.goal.trim().slice(0, 48),
      goalPrompt: input.goal,
      cwd: input.cwd,
      status: 'draft',
      autoMode: input.autoMode,
      goalId: input.goalId,
      budgetUsd: input.budgetUsd,
    });
    this.emitPlan(plan);

    // 2. Run the planner session and capture its JSON.
    let run;
    try {
      run = await runner.runOnce({
        cwd: input.cwd,
        role: 'planner',
        model: 'opus',
        prompt: `${this.deps.getMaestroPrompt()}\n\n=== GOAL ===\n${input.goal}`,
      });
    } catch (err) {
      run = { ok: false, output: '', error: (err as Error).message };
    }
    if (!run.ok) {
      plan = updatePlan(db, plan.id, { status: 'failed' }) ?? plan;
      this.emitPlan(plan);
      return { ok: false, planId: plan.id, errors: [run.error ?? 'planner failed'] };
    }

    // 3. Parse + validate (untrusted output → strict).
    const parsed = parsePlannerOutput(run.output, {
      knownAdvisorRoles: this.deps.getKnownAdvisorRoles(),
      knownModels: this.deps.knownModels,
    });
    if (!parsed.ok || !parsed.plan) {
      plan = updatePlan(db, plan.id, { status: 'failed' }) ?? plan;
      this.emitPlan(plan);
      return { ok: false, planId: plan.id, errors: parsed.errors };
    }

    // 4. Persist tasks.
    parsed.plan.tasks.forEach((t, i) => {
      const task = createPlanTask(db, {
        planId: plan.id,
        title: t.title,
        prompt: t.prompt,
        acceptanceCriteria: t.acceptanceCriteria,
        dependsOn: t.dependsOn,
        assignedAdvisorRole: t.assignedAdvisorRole,
        model: t.model,
        orderIndex: i,
      });
      broadcast({ type: 'plan_task_upsert', task });
    });

    // 5. Name the plan from the planner + move to the approval gate
    //    (or straight to running in autoMode — dispatch happens in Phase 2).
    plan =
      updatePlan(db, plan.id, {
        name: input.name?.trim() || parsed.plan.name,
        status: plan.autoMode ? 'running' : 'awaiting_approval',
      }) ?? plan;
    this.emitPlan(plan);

    return { ok: true, planId: plan.id, warnings: parsed.warnings };
  }

  /**
   * Human approves a planned plan → `running`. Dispatch of ready tasks is Phase
   * 2; here we only advance the status (idempotent — a non-awaiting plan is a
   * no-op).
   */
  approvePlan(planId: string): { ok: boolean; error?: string } {
    const plan = getPlan(this.deps.db, planId);
    if (!plan) return { ok: false, error: 'plan not found' };
    if (plan.status !== 'awaiting_approval') {
      return { ok: false, error: `plan is ${plan.status}, not awaiting_approval` };
    }
    const updated = updatePlan(this.deps.db, planId, { status: 'running' });
    if (updated) this.emitPlan(updated);
    return { ok: true };
  }

  /** Convenience for the UI/tests: a plan with its tasks. */
  getPlanWithTasks(planId: string) {
    const plan = getPlan(this.deps.db, planId);
    if (!plan) return null;
    return { plan, tasks: listPlanTasks(this.deps.db, planId) };
  }
}
