import { useMemo, useState } from 'react';
import type { Plan, PlanTask, PlanTaskStatus } from '@solix/shared';
import {
  selectPlansArray,
  selectPlanTasks,
  useSolixStore,
} from '../store/index.js';

interface PlanPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * v2 Maestro — the conductor's panel. Type a goal → the orchestrator runs a
 * planner session and returns a task DAG parked at `awaiting_approval`; you
 * review it and approve (dispatch is Phase 2). Right-docked, same archetype as
 * WorkspacePanel / GalaxyPanel.
 */
export function PlanPanel({ open, onClose }: PlanPanelProps): JSX.Element | null {
  const plans = useSolixStore(selectPlansArray);
  const projects = useSolixStore((s) => s.projects);
  const createPlanFromGoal = useSolixStore((s) => s.createPlanFromGoal);

  const defaultCwd = useMemo(() => {
    const p = Object.values(projects).sort(
      (a, b) => b.lastActiveAt - a.lastActiveAt,
    )[0];
    return p?.cwd ?? '';
  }, [projects]);

  const [goal, setGoal] = useState('');
  const [cwd, setCwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  if (!open) return null;

  const effectiveCwd = cwd || defaultCwd;

  const onPlan = async (): Promise<void> => {
    const g = goal.trim();
    if (!g || !effectiveCwd.trim() || busy) return;
    setBusy(true);
    setErrors([]);
    const res = await createPlanFromGoal(g, effectiveCwd.trim());
    setBusy(false);
    if (res.ok) setGoal('');
    else setErrors(res.errors ?? ['Planning failed.']);
  };

  return (
    <div className="absolute top-16 right-0 bottom-0 w-full sm:w-[480px] bg-solix-panel border-l border-solix-border backdrop-blur-md flex flex-col z-30">
      <div className="px-5 py-4 border-b border-solix-border flex items-start justify-between shrink-0">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-300">
            maestro
          </div>
          <div className="text-lg font-semibold mt-0.5">Plan a build</div>
          <div className="text-xs text-slate-400 mt-1 leading-snug">
            Describe a goal. Maestro breaks it into a task plan you approve —
            then it drives the fleet. <span className="text-slate-500">(Preview:
            planning + approval; dispatch is coming.)</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Goal composer */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Goal
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Add a login page with email + password and tests"
            rows={3}
            className="w-full text-sm bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent resize-none"
          />
          <input
            value={effectiveCwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/path/to/project"
            className="w-full text-xs font-mono bg-black/40 border border-solix-border rounded p-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-solix-accent"
          />
          {errors.length > 0 && (
            <div className="text-[11px] text-solix-danger border border-solix-danger/40 bg-solix-danger/10 rounded px-2 py-1 space-y-0.5">
              {errors.map((e) => (
                <div key={e}>· {e}</div>
              ))}
            </div>
          )}
          <button
            onClick={() => void onPlan()}
            disabled={busy || !goal.trim() || !effectiveCwd.trim()}
            className="w-full py-2 rounded bg-amber-500/20 border border-amber-400/60 text-amber-100 text-sm hover:bg-amber-500/30 disabled:opacity-40"
          >
            {busy ? 'Planning…' : '✷ Plan it'}
          </button>
        </div>

        {/* Existing plans */}
        {plans.length === 0 ? (
          <div className="text-xs text-slate-500 italic">
            No plans yet. Describe a goal above to create one.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              Plans · {plans.length}
            </div>
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PLAN_STATUS_COLOR: Record<Plan['status'], string> = {
  draft: 'text-slate-400 border-slate-600',
  awaiting_approval: 'text-amber-300 border-amber-400/50',
  running: 'text-solix-accent border-solix-accent/50',
  paused: 'text-slate-300 border-slate-500',
  completed: 'text-solix-ok border-solix-ok/50',
  failed: 'text-solix-danger border-solix-danger/50',
};

function PlanCard({ plan }: { plan: Plan }): JSX.Element {
  const tasks = useSolixStore((s) => selectPlanTasks(s, plan.id));
  const approvePlan = useSolixStore((s) => s.approvePlan);
  const abortPlan = useSolixStore((s) => s.abortPlan);
  const [busy, setBusy] = useState(false);

  const onApprove = async (): Promise<void> => {
    setBusy(true);
    await approvePlan(plan.id);
    setBusy(false);
  };

  const onAbort = async (): Promise<void> => {
    setBusy(true);
    await abortPlan(plan.id);
    setBusy(false);
  };

  return (
    <div className="rounded border border-solix-border bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">
            {plan.name}
          </div>
          <div className="text-[10px] text-slate-500 truncate">{plan.cwd}</div>
        </div>
        <span
          className={`shrink-0 text-[9px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${
            PLAN_STATUS_COLOR[plan.status] ?? 'text-slate-400 border-slate-600'
          }`}
        >
          {plan.status.replace('_', ' ')}
        </span>
      </div>

      {tasks.length > 0 && (
        <ol className="mt-2 space-y-1">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ol>
      )}

      {plan.status === 'awaiting_approval' && (
        <button
          onClick={() => void onApprove()}
          disabled={busy}
          className="mt-3 w-full py-1.5 rounded bg-solix-ok/20 border border-solix-ok text-solix-ok text-xs hover:bg-solix-ok/30 disabled:opacity-40"
        >
          {busy ? 'Approving…' : 'Approve & run'}
        </button>
      )}

      {plan.status === 'running' && (
        <button
          onClick={() => void onAbort()}
          disabled={busy}
          className="mt-3 w-full py-1.5 rounded bg-solix-danger/15 border border-solix-danger/60 text-solix-danger text-xs hover:bg-solix-danger/25 disabled:opacity-40"
        >
          {busy ? 'Stopping…' : 'Abort run (stop agents)'}
        </button>
      )}
    </div>
  );
}

const TASK_STATUS_COLOR: Record<PlanTaskStatus, string> = {
  pending: 'bg-slate-600',
  ready: 'bg-solix-accent',
  dispatched: 'bg-solix-accent solix-pulse',
  verifying: 'bg-amber-400 solix-pulse',
  completed: 'bg-solix-ok',
  failed: 'bg-solix-warn',
  escalated: 'bg-solix-danger',
  blocked: 'bg-slate-700',
  skipped: 'bg-slate-700',
};

function TaskRow({ task }: { task: PlanTask }): JSX.Element {
  // Surface the rejection reason once a task needs a human (escalated) or is
  // mid-retry (failed) so the operator sees *why* without opening a session.
  const showError =
    task.lastError && (task.status === 'escalated' || task.status === 'failed');
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            TASK_STATUS_COLOR[task.status] ?? 'bg-slate-600'
          }`}
          title={task.status}
        />
        <span className="text-slate-200 truncate flex-1">{task.title}</span>
        {task.attempts > 1 && (
          <span
            className="text-[9px] text-slate-500 shrink-0"
            title={`${task.attempts} of ${task.maxAttempts} attempts`}
          >
            ×{task.attempts}
          </span>
        )}
        {task.assignedAdvisorRole && (
          <span className="text-[9px] uppercase tracking-wide text-slate-500 shrink-0">
            {task.assignedAdvisorRole}
          </span>
        )}
        {task.dependsOn.length > 0 && (
          <span
            className="text-[9px] text-slate-600 shrink-0"
            title={`depends on ${task.dependsOn.join(', ')}`}
          >
            ↳{task.dependsOn.length}
          </span>
        )}
      </div>
      {showError && (
        <div className="mt-0.5 ml-4 text-[10px] text-solix-danger/80 line-clamp-2">
          {task.lastError}
        </div>
      )}
    </li>
  );
}
