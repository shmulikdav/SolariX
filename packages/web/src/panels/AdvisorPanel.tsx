import { useState } from 'react';
import { useSolixStore } from '../store/index.js';

export function AdvisorPanel(): JSX.Element | null {
  const advisorId = useSolixStore((s) => s.selectedAdvisorId);
  const advisor = useSolixStore((s) =>
    advisorId ? s.advisors[advisorId] : null,
  );
  const targetSession = useSolixStore((s) =>
    s.selectedSessionId ? s.sessions[s.selectedSessionId] : null,
  );
  const select = useSolixStore((s) => s.selectAdvisor);
  const invokeAdvisor = useSolixStore((s) => s.invokeAdvisor);
  const pinAdvisor = useSolixStore((s) => s.pinAdvisor);
  const unpinAdvisor = useSolixStore((s) => s.unpinAdvisor);

  const [prompt, setPrompt] = useState('');

  if (!advisor) return null;

  const onInvoke = (): void => {
    invokeAdvisor(advisor.id, prompt.trim() || undefined);
    setPrompt('');
  };

  return (
    <div className="absolute top-0 right-0 h-full w-[420px] bg-solix-panel border-l border-solix-border backdrop-blur-md flex flex-col z-20">
      <div className="px-4 py-3 border-b border-solix-border flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-amber-200/70">
            Advisor
          </div>
          <div className="text-lg font-semibold flex items-center gap-2">
            <span style={{ color: advisor.color }}>{advisor.glyph}</span>
            <span>{advisor.codename}</span>
            {advisor.pinned && (
              <span className="text-[10px] uppercase tracking-wider text-amber-300 border border-amber-300/40 rounded px-1.5 py-0.5">
                pinned
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {advisor.name} · {String(advisor.defaultModel)}
          </div>
        </div>
        <button
          onClick={() => select(null)}
          className="text-slate-400 hover:text-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3 border-b border-solix-border text-sm text-slate-300 leading-relaxed">
        {advisor.description}
      </div>

      {advisor.requiredSkills.length > 0 && (
        <div className="px-4 py-2 border-b border-solix-border">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
            requires skills
          </div>
          <div className="flex flex-wrap gap-1.5">
            {advisor.requiredSkills.map((s) => (
              <span
                key={s}
                className="text-[10px] px-1.5 py-0.5 rounded bg-solix-accent/15 border border-solix-accent/40 text-solix-accent"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm text-slate-300">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Invoke
        </div>
        <div className="text-xs text-slate-500">
          {targetSession ? (
            <>
              Will dispatch to{' '}
              <span className="text-slate-200">
                {targetSession.name ?? targetSession.id.slice(0, 8)}
              </span>{' '}
              <span className="text-slate-500">({targetSession.cwd})</span>
            </>
          ) : (
            <>No planet focused. Click a user planet first to set a target.</>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Optional: hand ${advisor.codename} a specific brief…`}
          rows={4}
          className="w-full text-sm bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent resize-none"
        />
      </div>

      <div className="px-4 py-3 border-t border-solix-border flex gap-2">
        <button
          onClick={onInvoke}
          className="flex-1 py-2 rounded bg-solix-accent/20 border border-solix-accent text-solix-accent text-sm hover:bg-solix-accent/30"
        >
          Invoke
        </button>
        {advisor.pinned ? (
          <button
            onClick={() => unpinAdvisor(advisor.id)}
            className="px-3 py-2 rounded bg-amber-500/15 border border-amber-400/50 text-amber-200 text-sm hover:bg-amber-500/25"
          >
            Unpin
          </button>
        ) : (
          <button
            onClick={() => pinAdvisor(advisor.id)}
            className="px-3 py-2 rounded bg-amber-500/10 border border-amber-400/30 text-amber-200/80 text-sm hover:bg-amber-500/20"
            title="Spawn an always-on session for this advisor"
          >
            Pin
          </button>
        )}
      </div>
    </div>
  );
}
