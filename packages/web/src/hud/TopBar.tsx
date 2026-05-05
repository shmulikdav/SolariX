import { useSolixStore, selectPlanets } from '../store/index.js';

interface TopBarProps {
  onOpenGalaxy?: () => void;
  onNewTask?: () => void;
  onOpenTimeline?: () => void;
}

export function TopBar({
  onOpenGalaxy,
  onNewTask,
  onOpenTimeline,
}: TopBarProps = {}): JSX.Element {
  const connected = useSolixStore((s) => s.connected);
  const planets = useSolixStore(selectPlanets);
  const viewMode = useSolixStore((s) => s.viewMode);
  const playbackActive = useSolixStore((s) => s.playback.active);

  const counts = planets.reduce(
    (acc, s) => {
      if (s.status === 'active') acc.active += 1;
      else if (
        s.status === 'awaiting_permission' ||
        s.status === 'awaiting_input' ||
        s.status === 'plan_review'
      )
        acc.attention += 1;
      else if (s.status === 'idle') acc.idle += 1;
      return acc;
    },
    { active: 0, idle: 0, attention: 0 },
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 z-20">
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="text-xl font-bold tracking-widest text-solix-accent">
          SOLIX
        </div>
        <div className="text-xs text-slate-400">
          a solar-system command center
        </div>
        <div
          className={`ml-3 px-2 py-1 rounded text-[10px] border ${
            connected
              ? 'border-solix-ok text-solix-ok'
              : 'border-solix-danger text-solix-danger solix-pulse'
          }`}
        >
          {connected ? 'CONNECTED' : 'OFFLINE'}
        </div>
        {playbackActive && (
          <div className="ml-2 px-2 py-1 rounded text-[10px] border border-solix-accent text-solix-accent solix-pulse">
            ▸ PLAYBACK
          </div>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-3 text-xs">
        <Stat label="active" value={counts.active} color="text-solix-ok" />
        <Stat label="attention" value={counts.attention} color="text-solix-warn" />
        <Stat label="idle" value={counts.idle} color="text-slate-400" />
        <ViewToggle viewMode={viewMode} />
        {onOpenTimeline && (
          <button
            onClick={onOpenTimeline}
            className="px-2 py-1 rounded bg-solix-panel border border-solix-border text-slate-300 hover:text-white hover:bg-solix-border/30"
            title="Timeline playback (T)"
          >
            ⏱ Timeline
          </button>
        )}
        {onNewTask && (
          <button
            onClick={onNewTask}
            className="px-2 py-1 rounded bg-solix-ok/15 border border-solix-ok/40 text-solix-ok hover:bg-solix-ok/25"
            title="Launch a new Claude Code task (L)"
          >
            + Task
          </button>
        )}
        {onOpenGalaxy && (
          <button
            onClick={onOpenGalaxy}
            className="px-2 py-1 rounded bg-solix-accent/15 border border-solix-accent/40 text-solix-accent hover:bg-solix-accent/25"
            title="Galaxy: export and import (G)"
          >
            ⌬ Galaxy
          </button>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  viewMode,
}: {
  viewMode: 'galaxy' | 'list' | 'missions';
}): JSX.Element {
  const setViewMode = useSolixStore((s) => s.setViewMode);
  const opts: { mode: 'galaxy' | 'list' | 'missions'; label: string }[] = [
    { mode: 'galaxy', label: '🪐' },
    { mode: 'list', label: '☰' },
    { mode: 'missions', label: '◎' },
  ];
  return (
    <div className="inline-flex rounded border border-solix-border bg-solix-panel overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.mode}
          onClick={() => setViewMode(o.mode)}
          className={`px-2 py-1 text-xs ${
            viewMode === o.mode
              ? 'bg-solix-border/50 text-white'
              : 'text-slate-400 hover:text-slate-100'
          }`}
          title={`${o.mode} view (V)`}
        >
          {o.label}{' '}
          <span className="capitalize">{o.mode}</span>
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): JSX.Element {
  return (
    <div className="px-2 py-1 rounded bg-solix-panel border border-solix-border">
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="ml-1 opacity-60 uppercase tracking-wide">{label}</span>
    </div>
  );
}
