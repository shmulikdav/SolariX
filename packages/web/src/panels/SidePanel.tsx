import { useMemo } from 'react';
import { useSolixStore } from '../store/index.js';
import { statusLabel } from '../scene/colors.js';

export function SidePanel(): JSX.Element | null {
  const selectedId = useSolixStore((s) => s.selectedSessionId);
  const sessions = useSolixStore((s) => s.sessions);
  const missions = useSolixStore((s) => s.missions);
  const selectSession = useSolixStore((s) => s.selectSession);

  const session = selectedId ? sessions[selectedId] : null;
  const sessionMissions = useMemo(() => {
    if (!session) return [];
    return Object.values(missions)
      .filter((m) => m.sessionId === session.id)
      .sort((a, b) => b.startedAt - a.startedAt);
  }, [missions, session]);

  if (!session) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-[420px] bg-solix-panel border-l border-solix-border backdrop-blur-md flex flex-col z-20">
      <div className="px-4 py-3 border-b border-solix-border flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Planet
          </div>
          <div className="text-lg font-semibold">
            {session.name ?? session.id.slice(0, 8)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {String(session.model)} · {statusLabel(session.status)}
            {session.origin === 'external' ? ' · external' : ''}
          </div>
        </div>
        <button
          onClick={() => selectSession(null)}
          className="text-slate-400 hover:text-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 border-b border-solix-border">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>context</span>
          <span>{session.contextUsagePct.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-solix-accent"
            style={{ width: `${Math.min(100, session.contextUsagePct)}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Mission log
        </div>
        {sessionMissions.length === 0 ? (
          <div className="text-sm text-slate-500 italic">
            No missions yet. Send a prompt in this Claude session.
          </div>
        ) : (
          sessionMissions.map((m) => (
            <div
              key={m.id}
              className="rounded border border-solix-border p-3 bg-black/30"
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`font-semibold ${
                    m.status === 'active'
                      ? 'text-solix-warn'
                      : m.status === 'completed'
                        ? 'text-solix-ok'
                        : 'text-slate-300'
                  }`}
                >
                  {m.shortName}
                </span>
                <span className="text-slate-500">
                  {new Date(m.startedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-200 line-clamp-3">
                {m.prompt}
              </div>
              <div className="mt-2 flex gap-3 text-[10px] text-slate-500">
                <span>{m.metrics.toolCallCount} tools</span>
                <span>{m.metrics.subagentCount} subagents</span>
                <span>{m.filesTouched.length} files</span>
                {m.metrics.durationMs !== undefined && (
                  <span>{(m.metrics.durationMs / 1000).toFixed(1)}s</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-solix-border text-xs text-slate-500">
        {session.origin === 'internal'
          ? 'Composer (M3.5)'
          : 'External session — keep typing in your terminal.'}
      </div>
    </div>
  );
}
