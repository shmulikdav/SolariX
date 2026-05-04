import { useSolixStore } from '../store/index.js';

export function SceneControls(): JSX.Element {
  const motionEnabled = useSolixStore((s) => s.motionEnabled);
  const toggleMotion = useSolixStore((s) => s.toggleMotion);

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-20">
      <button
        onClick={toggleMotion}
        title={`${motionEnabled ? 'Pause' : 'Play'} orbital motion (Space)`}
        className={`pointer-events-auto w-10 h-10 rounded-full text-base flex items-center justify-center border backdrop-blur transition-colors ${
          motionEnabled
            ? 'bg-solix-accent/20 border-solix-accent text-solix-accent'
            : 'bg-solix-panel/80 border-solix-border text-slate-300 hover:bg-solix-border/40 hover:text-white'
        }`}
      >
        {motionEnabled ? '⏸' : '▶'}
      </button>
    </div>
  );
}
