import { useSolixStore } from '../store/index.js';
import {
  panDown,
  panLeft,
  panRight,
  panUp,
  reset,
  zoomIn,
  zoomOut,
} from '../scene/cameraControls.js';

export function SceneControls(): JSX.Element {
  const motionEnabled = useSolixStore((s) => s.motionEnabled);
  const toggleMotion = useSolixStore((s) => s.toggleMotion);

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex items-end gap-3">
      <Cluster label="motion">
        <Btn
          active={motionEnabled}
          onClick={toggleMotion}
          title="Play/pause orbital motion (Space)"
        >
          {motionEnabled ? '⏸' : '▶'}
        </Btn>
      </Cluster>

      <Cluster label="zoom">
        <Btn onClick={() => zoomIn()} title="Zoom in (+)">
          +
        </Btn>
        <Btn onClick={() => zoomOut()} title="Zoom out (−)">
          −
        </Btn>
      </Cluster>

      <Cluster label="pan / reset">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <Btn onClick={panUp} title="Pan up (↑)">
            ↑
          </Btn>
          <span />
          <Btn onClick={panLeft} title="Pan left (←)">
            ←
          </Btn>
          <Btn onClick={reset} title="Reset camera (0)">
            ⌂
          </Btn>
          <Btn onClick={panRight} title="Pan right (→)">
            →
          </Btn>
          <span />
          <Btn onClick={panDown} title="Pan down (↓)">
            ↓
          </Btn>
          <span />
        </div>
      </Cluster>
    </div>
  );
}

function Cluster({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="pointer-events-auto rounded-lg border border-solix-border bg-solix-panel/80 backdrop-blur p-2">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1.5 text-center">
        {label}
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Btn({
  onClick,
  title,
  active = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded text-sm flex items-center justify-center border transition-colors ${
        active
          ? 'bg-solix-accent/20 border-solix-accent text-solix-accent'
          : 'border-solix-border text-slate-300 hover:bg-solix-border/40 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
