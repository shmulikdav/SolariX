import { useSolixStore, selectPlanets } from '../store/index.js';

export function TopBar(): JSX.Element {
  const connected = useSolixStore((s) => s.connected);
  const planets = useSolixStore(selectPlanets);

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
      </div>

      <div className="pointer-events-auto flex items-center gap-3 text-xs">
        <Stat label="active" value={counts.active} color="text-solix-ok" />
        <Stat label="attention" value={counts.attention} color="text-solix-warn" />
        <Stat label="idle" value={counts.idle} color="text-slate-400" />
      </div>
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
