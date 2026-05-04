import { useEffect, useState } from 'react';
import { useSolixStore } from '../store/index.js';

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
}

const MODELS = ['default', 'opus', 'sonnet', 'haiku'] as const;

export function NewTaskModal({
  open,
  onClose,
}: NewTaskModalProps): JSX.Element | null {
  const projects = useSolixStore((s) => s.projects);
  const launchTask = useSolixStore((s) => s.launchTask);

  const projectList = Object.values(projects).sort(
    (a, b) => b.lastActiveAt - a.lastActiveAt,
  );
  const [cwd, setCwd] = useState<string>('');
  const [model, setModel] = useState<string>('default');
  const [prompt, setPrompt] = useState('');

  // When the modal opens (or when projects first arrive), default cwd to the
  // most recently active project so the user doesn't have to type a path.
  useEffect(() => {
    if (!open) return;
    if (cwd) return;
    const first = projectList[0];
    if (first) setCwd(first.cwd);
  }, [open, projectList, cwd]);

  if (!open) return null;

  const onLaunch = (): void => {
    const trimmedCwd = cwd.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedCwd || !trimmedPrompt) return;
    launchTask(trimmedCwd, model, trimmedPrompt);
    setPrompt('');
    onClose();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[520px] max-w-[92vw] rounded-xl border border-solix-accent/40 bg-solix-panel/95 shadow-2xl">
        <div className="px-5 py-4 border-b border-solix-border flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-solix-accent">
              new task
            </div>
            <div className="text-lg font-semibold mt-0.5">
              Launch a Claude Code session
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Solix will spawn <code>claude --print</code> in this folder. A
              new planet appears the moment it starts.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
              Working directory
            </div>
            {projectList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {projectList.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCwd(p.cwd)}
                    className={`text-[10px] px-2 py-1 rounded border ${
                      cwd === p.cwd
                        ? 'bg-solix-accent/20 border-solix-accent text-solix-accent'
                        : 'border-solix-border text-slate-300 hover:bg-solix-border/30'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/Users/you/path/to/project"
              className="w-full text-sm font-mono bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent"
            />
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
              Model
            </div>
            <div className="flex gap-1.5">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    model === m
                      ? 'bg-solix-accent/20 border-solix-accent text-solix-accent'
                      : 'border-solix-border text-slate-300 hover:bg-solix-border/30'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
              Prompt
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onLaunch();
                }
              }}
              placeholder="What should this Claude Code session do?"
              rows={4}
              className="w-full text-sm bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent resize-none"
            />
          </label>
        </div>

        <div className="px-5 py-3 border-t border-solix-border flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-solix-border text-xs text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-500 mr-2">
            Cmd/Ctrl+Enter
          </span>
          <button
            onClick={onLaunch}
            disabled={!cwd.trim() || !prompt.trim()}
            className="px-4 py-1.5 rounded bg-solix-accent/20 border border-solix-accent text-solix-accent text-sm hover:bg-solix-accent/30 disabled:opacity-40"
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  );
}
