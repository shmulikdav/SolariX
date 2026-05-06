import { useMemo, useState } from 'react';
import type { Mission, Project } from '@solix/shared';
import { useSolixStore } from '../store/index.js';
import { GLOSSARY } from '../glossary.js';

type StatusFilter = 'all' | 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Mission-first lens. Where Galaxy view answers "which agents are
 * running?" and List view answers "what's the state of every agent?",
 * Mission view answers "what work has happened and what's in progress?"
 *
 * Rows are missions, not agents. Each card shows:
 *   - mission shortName + truncated prompt
 *   - status badge
 *   - the agent (session) that ran it
 *   - tool count, subagent count, duration if completed
 *   - files touched chips
 *
 * Grouped by project — same project header pattern as List view.
 */
export function MissionView(): JSX.Element {
  const missions = useSolixStore((s) => s.missions);
  const sessions = useSolixStore((s) => s.sessions);
  const projects = useSolixStore((s) => s.projects);
  const selectSession = useSolixStore((s) => s.selectSession);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const all = Object.values(missions).sort(
      (a, b) => b.startedAt - a.startedAt,
    );
    if (statusFilter === 'all') return all;
    return all.filter((m) => m.status === statusFilter);
  }, [missions, statusFilter]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { project?: Project; missions: Mission[] }
    >();
    for (const m of filtered) {
      const session = sessions[m.sessionId];
      const project = session ? projects[session.projectId] : undefined;
      const key = project?.id ?? '_';
      const entry = map.get(key);
      if (entry) entry.missions.push(m);
      else map.set(key, { project, missions: [m] });
    }
    return [...map.values()].sort(
      (a, b) =>
        (b.missions[0]?.startedAt ?? 0) - (a.missions[0]?.startedAt ?? 0),
    );
  }, [filtered, sessions, projects]);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-solix-bg pt-20 pb-8 px-6 z-0">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-widest">
            Missions · {filtered.length}
          </div>
          <div className="flex items-center gap-1.5">
            {(
              ['all', 'active', 'completed', 'failed', 'cancelled'] as const
            ).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  statusFilter === s
                    ? 'bg-solix-accent/15 border-solix-accent text-solix-accent'
                    : 'border-solix-border text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-slate-500 italic py-12 text-center border border-solix-border rounded">
            No missions yet. Send a prompt to a Claude Code session and a
            mission card will appear here.
          </div>
        ) : (
          groups.map(({ project, missions: pms }) => {
            const projectName = project?.name ?? '(unassigned)';
            return (
              <section
                key={project?.id ?? '_'}
                className="mb-6 rounded border border-solix-border overflow-hidden"
              >
                <header className="bg-solix-panel/60 px-4 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-slate-100">
                      {projectName}
                    </span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                      {pms.length} mission{pms.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {project?.cwd && (
                    <span className="text-[10px] font-mono text-slate-500 truncate max-w-[55%]">
                      {project.cwd}
                    </span>
                  )}
                </header>

                <ul className="divide-y divide-solix-border">
                  {pms.map((m) => {
                    const session = sessions[m.sessionId];
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => selectSession(m.sessionId)}
                          className="w-full text-left p-4 hover:bg-solix-border/20 cursor-pointer block"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-100">
                                  {m.shortName}
                                </span>
                                <StatusBadge status={m.status} />
                              </div>
                              <div className="mt-1 text-xs text-slate-400 line-clamp-2">
                                {m.prompt}
                              </div>
                              {m.longSummary && (
                                <div className="mt-1 text-xs text-slate-300 italic">
                                  {m.longSummary}
                                </div>
                              )}
                              {m.status === 'failed' && m.errorSummary && (
                                <div className="mt-1 text-xs text-solix-danger italic line-clamp-2">
                                  error: {m.errorSummary}
                                </div>
                              )}
                            </div>
                            <div className="text-right text-[10px] text-slate-500 font-mono whitespace-nowrap">
                              {relativeTime(m.startedAt)}
                              {m.metrics.durationMs !== undefined && (
                                <div>
                                  {(m.metrics.durationMs / 1000).toFixed(1)}s
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                            {session && (
                              <span>
                                agent:{' '}
                                <span className="text-slate-300">
                                  {session.name ?? session.id.slice(0, 8)}
                                </span>
                              </span>
                            )}
                            <span>{m.metrics.toolCallCount} tools</span>
                            <span title={GLOSSARY.subagent}>
                              {m.metrics.subagentCount} subagents
                            </span>
                            <span>{m.filesTouched.length} files</span>
                          </div>

                          {m.filesTouched.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {m.filesTouched.slice(0, 6).map((f) => (
                                <span
                                  key={f}
                                  className="text-[10px] font-mono text-slate-400 bg-black/30 border border-solix-border rounded px-1.5 py-0.5"
                                >
                                  {basename(f)}
                                </span>
                              ))}
                              {m.filesTouched.length > 6 && (
                                <span className="text-[10px] text-slate-500">
                                  +{m.filesTouched.length - 6}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}): JSX.Element {
  const cls =
    status === 'active'
      ? 'border-solix-warn text-solix-warn'
      : status === 'completed'
        ? 'border-solix-ok text-solix-ok'
        : status === 'failed'
          ? 'border-solix-danger text-solix-danger'
          : 'border-solix-border text-slate-400';
  return (
    <span
      className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}
    >
      {status}
    </span>
  );
}

function basename(p: string): string {
  const m = p.match(/[^/\\]+\/?$/);
  return m ? m[0].replace(/\/$/, '') : p;
}

function relativeTime(ts: number): string {
  const dt = Date.now() - ts;
  if (dt < 0) return 'now';
  const sec = Math.floor(dt / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}
