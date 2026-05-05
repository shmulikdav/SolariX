import { useEffect, useState } from 'react';
import { useSolixStore } from '../store/index.js';
import type { Mission, Session } from '@solix/shared';
import { suggestForPermission } from '../suggestions.js';

/**
 * Decision Queue — the "what do I need to do?" inbox.
 *
 * Always visible top-right, even when empty. Replaces the old
 * PermissionTray. Each pending permission becomes a card with:
 *   - which agent + which mission it belongs to
 *   - the tool + a one-line summary of the args
 *   - three actions: Approve (Y), Deny (N), Ask (opens chat)
 *
 * Sorted newest-first so the most recent block is at the top of the
 * queue.
 */
export function DecisionQueue(): JSX.Element {
  const pending = useSolixStore((s) => s.pendingPermissions);
  const sessions = useSolixStore((s) => s.sessions);
  const missions = useSolixStore((s) => s.missions);
  const resolve = useSolixStore((s) => s.resolvePermission);
  const selectSession = useSolixStore((s) => s.selectSession);

  const items = Object.values(pending).sort(
    (a, b) => b.receivedAt - a.receivedAt,
  );
  const [collapsed, setCollapsed] = useState(false);

  // When a new item arrives, force-expand the queue so the user sees it.
  const count = items.length;
  useEffect(() => {
    if (count > 0) setCollapsed(false);
  }, [count]);

  const onAsk = (sessionId: string): void => {
    selectSession(sessionId);
    setCollapsed(true);
  };

  return (
    <div className="absolute top-20 right-4 z-30 w-80 flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto rounded border border-solix-border bg-solix-panel/85 backdrop-blur px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">
            Decisions
          </span>
          <span
            className={`text-xs font-bold ${
              count > 0 ? 'text-solix-danger' : 'text-slate-500'
            }`}
          >
            {count}
          </span>
        </div>
        {count > 0 && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-[10px] text-slate-400 hover:text-slate-100"
          >
            {collapsed ? 'show' : 'hide'}
          </button>
        )}
      </div>

      {count === 0 && (
        <div className="pointer-events-auto rounded border border-solix-border bg-solix-panel/60 backdrop-blur px-3 py-2 text-xs text-slate-500 italic">
          All clear. Nothing waiting.
        </div>
      )}

      {!collapsed &&
        items.map((p) => {
          const session = sessions[p.sessionId];
          const mission =
            session?.currentMissionId
              ? missions[session.currentMissionId]
              : undefined;
          return (
            <DecisionCard
              key={p.requestId}
              session={session}
              mission={mission}
              tool={p.tool}
              args={p.args}
              onApprove={() => resolve(p.requestId, true)}
              onDeny={() => resolve(p.requestId, false)}
              onAsk={() => onAsk(p.sessionId)}
            />
          );
        })}
    </div>
  );
}

interface DecisionCardProps {
  session: Session | undefined;
  mission: Mission | undefined;
  tool: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
  onAsk: () => void;
}

function DecisionCard({
  session,
  mission,
  tool,
  args,
  onApprove,
  onDeny,
  onAsk,
}: DecisionCardProps): JSX.Element {
  const name =
    session?.name ?? session?.id.slice(0, 8) ?? 'unknown agent';
  const project = session?.cwd ? basename(session.cwd) : '';
  const suggestion = session
    ? suggestForPermission(session, mission, tool, args)
    : null;

  return (
    <div className="pointer-events-auto rounded border border-solix-danger bg-solix-danger/10 p-3 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-solix-danger">
          {name}
        </div>
        {project && (
          <div className="text-[10px] text-slate-500 truncate ml-2 max-w-[55%]">
            {project}
          </div>
        )}
      </div>

      {mission && (
        <div className="mt-1 text-[11px] text-slate-400 italic truncate">
          mission: {mission.shortName}
        </div>
      )}

      <div className="mt-2 text-sm text-slate-100">
        <span className="font-semibold">{tool}</span>
        <span className="ml-1 text-slate-300 text-xs break-words">
          {summarizeArgs(args)}
        </span>
      </div>

      {suggestion && <SuggestionLine suggestion={suggestion} />}

      <div className="mt-3 flex gap-1.5">
        <button
          onClick={onApprove}
          className="flex-1 py-1.5 rounded bg-solix-ok/20 border border-solix-ok text-solix-ok text-xs hover:bg-solix-ok/30"
        >
          Approve · Y
        </button>
        <button
          onClick={onDeny}
          className="flex-1 py-1.5 rounded bg-solix-danger/20 border border-solix-danger text-solix-danger text-xs hover:bg-solix-danger/30"
        >
          Deny · N
        </button>
        <button
          onClick={onAsk}
          className="px-2.5 py-1.5 rounded border border-solix-border text-slate-300 text-xs hover:text-white hover:bg-solix-border/30"
          title="Open chat with this agent for context"
        >
          Ask
        </button>
      </div>
    </div>
  );
}

function SuggestionLine({
  suggestion,
}: {
  suggestion: { text: string; severity: 'info' | 'warn' | 'danger' };
}): JSX.Element {
  const colorClass =
    suggestion.severity === 'danger'
      ? 'text-solix-danger border-solix-danger/40 bg-solix-danger/10'
      : suggestion.severity === 'warn'
        ? 'text-solix-warn border-solix-warn/40 bg-solix-warn/10'
        : 'text-slate-300 border-solix-border bg-black/20';
  return (
    <div
      className={`mt-2 px-2 py-1 rounded border text-[11px] leading-snug ${colorClass}`}
    >
      <span className="font-semibold mr-1">Suggested:</span>
      {suggestion.text}
    </div>
  );
}

function basename(p: string): string {
  const m = p.match(/[^/\\]+\/?$/);
  return m ? m[0].replace(/\/$/, '') : p;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (!keys.length) return '';
  const summarized = keys.slice(0, 2).map((k) => {
    const v = args[k];
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${s.length > 40 ? s.slice(0, 40) + '…' : s}`;
  });
  return summarized.join(' · ');
}
