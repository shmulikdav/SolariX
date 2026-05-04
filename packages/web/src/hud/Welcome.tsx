import { useEffect, useState } from 'react';
import { useSolixStore } from '../store/index.js';

const STORAGE_KEY = 'solix.welcome.dismissed.v1';

interface WelcomeProps {
  onOpenGalaxy: () => void;
}

export function Welcome({ onOpenGalaxy }: WelcomeProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  const advisorCount = useSolixStore(
    (s) => Object.keys(s.advisors).length,
  );
  const skillCount = useSolixStore((s) => Object.keys(s.skills).length);
  const sessionCount = useSolixStore(
    (s) => Object.keys(s.sessions).length,
  );

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-hide once the user has any session (real or demo) — they've moved past
  // the "empty galaxy" moment.
  if (dismissed) return null;
  if (sessionCount > 0) return null;

  const close = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-xl w-full mx-4 rounded-xl border border-solix-accent/40 bg-solix-panel/95 backdrop-blur-md shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-solix-border">
          <div className="text-xs uppercase tracking-widest text-solix-accent">
            welcome
          </div>
          <div className="text-2xl font-bold mt-1">
            Solix — your agent solar system
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Mission control for Claude Code. Each agent orbits the sun;
            each click is a conversation with one of your planets.
          </div>
        </div>

        <div className="px-6 py-4 space-y-3 text-sm text-slate-300">
          <Step
            n={1}
            title="Run a Claude Code session"
            body={
              <>
                Open a terminal anywhere and run{' '}
                <code className="bg-black/40 px-1 rounded">claude</code>. A
                planet will appear here within a second.
              </>
            }
          />
          <Step
            n={2}
            title="Or seed the demo state"
            body={
              <>
                In another terminal:{' '}
                <code className="bg-black/40 px-1 rounded">solix demo</code>
                . You'll get 3 planets, a moon, a permission flare, and a
                pinned advisor — without running Claude Code.
              </>
            }
          />
          <Step
            n={3}
            title="Click an advisor in the inner ring"
            body={
              <>
                {advisorCount > 0
                  ? `${advisorCount} crew members are loaded.`
                  : 'Crew loading…'}{' '}
                Click any of them — Compass (PM), Forge (Builder), Lumen
                (UX), Argus (Reviewer), Sentinel (Security) — to read their
                role and Invoke them on the focused planet.
              </>
            }
          />
          <Step
            n={4}
            title="Browse the asteroid belt"
            body={
              <>
                Each asteroid is a Skill ({skillCount} discovered). Click
                one to read its SKILL.md and see which advisors require it.
              </>
            }
          />
          <Step
            n={5}
            title="Share your galaxy"
            body={
              <>
                Press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-solix-border text-[10px]">
                  G
                </kbd>{' '}
                or click <span className="text-solix-accent">⌬ Galaxy</span>{' '}
                in the top bar to export, import, publish, or install a
                galaxy from a registry.
              </>
            }
          />
        </div>

        <div className="px-6 py-3 border-t border-solix-border flex items-center gap-2">
          <button
            onClick={() => {
              onOpenGalaxy();
              close();
            }}
            className="px-3 py-1.5 rounded bg-solix-accent/15 border border-solix-accent/40 text-solix-accent text-xs hover:bg-solix-accent/25"
          >
            Open Galaxy panel
          </button>
          <div className="flex-1" />
          <button
            onClick={close}
            className="px-3 py-1.5 rounded border border-solix-border text-xs text-slate-300 hover:text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-solix-accent/20 border border-solix-accent/40 text-solix-accent text-xs flex items-center justify-center">
        {n}
      </div>
      <div>
        <div className="text-slate-100 font-medium text-sm">{title}</div>
        <div className="text-slate-400 text-xs mt-0.5 leading-relaxed">
          {body}
        </div>
      </div>
    </div>
  );
}
