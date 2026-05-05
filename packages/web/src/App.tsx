import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene.js';
import { ListView } from './hud/ListView.js';
import { TopBar } from './hud/TopBar.js';
import { Toasts } from './hud/Toasts.js';
import { Welcome } from './hud/Welcome.js';
import { DecisionQueue } from './hud/DecisionQueue.js';
import { SceneControls } from './hud/SceneControls.js';
import {
  panDown,
  panLeft,
  panRight,
  panUp,
  reset as cameraReset,
  zoomIn as cameraZoomIn,
  zoomOut as cameraZoomOut,
} from './scene/cameraControls.js';
import { SidePanel } from './panels/SidePanel.js';
import { AdvisorPanel } from './panels/AdvisorPanel.js';
import { SkillPanel } from './panels/SkillPanel.js';
import { GalaxyPanel } from './panels/GalaxyPanel.js';
import { NewTaskModal } from './panels/NewTaskModal.js';
import { useSolixStore } from './store/index.js';
import { startWsClient } from './ws/client.js';

export default function App(): JSX.Element {
  const [galaxyOpen, setGalaxyOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  useEffect(() => {
    startWsClient();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const state = useSolixStore.getState();
      const target = e.target as HTMLElement | null;
      const isTextField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      const pending = Object.values(state.pendingPermissions);
      const top = pending[0];

      if (e.key === 'Escape') {
        state.selectSession(null);
        state.selectAdvisor(null);
        state.selectSkill(null);
        setGalaxyOpen(false);
        setNewTaskOpen(false);
      } else if (!isTextField && (e.key === 'g' || e.key === 'G')) {
        setGalaxyOpen((v) => !v);
      } else if (!isTextField && (e.key === 'l' || e.key === 'L')) {
        setNewTaskOpen(true);
      } else if (!isTextField && (e.key === '+' || e.key === '=')) {
        cameraZoomIn();
      } else if (!isTextField && e.key === '-') {
        cameraZoomOut();
      } else if (!isTextField && e.key === '0') {
        cameraReset();
      } else if (!isTextField && e.key === 'ArrowLeft') {
        panLeft();
      } else if (!isTextField && e.key === 'ArrowRight') {
        panRight();
      } else if (!isTextField && e.key === 'ArrowUp') {
        panUp();
      } else if (!isTextField && e.key === 'ArrowDown') {
        panDown();
      } else if (!isTextField && e.key === ' ') {
        e.preventDefault();
        state.toggleMotion();
      } else if (!isTextField && (e.key === 'v' || e.key === 'V')) {
        state.toggleViewMode();
      } else if (!isTextField && top && (e.key === 'y' || e.key === 'Y')) {
        state.resolvePermission(top.requestId, true);
      } else if (!isTextField && top && (e.key === 'n' || e.key === 'N')) {
        state.resolvePermission(top.requestId, false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-full w-full">
      <ViewSurface />
      <TopBar
        onOpenGalaxy={() => setGalaxyOpen(true)}
        onNewTask={() => setNewTaskOpen(true)}
      />
      <DecisionQueue />
      <SidePanel />
      <AdvisorPanel />
      <SkillPanel />
      <GalaxyPanel
        open={galaxyOpen}
        onClose={() => setGalaxyOpen(false)}
      />
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
      />
      <SceneControls />
      <Welcome onOpenGalaxy={() => setGalaxyOpen(true)} />
      <Toasts />
      <EmptyHint />
    </div>
  );
}

/**
 * Renders either the 3D galaxy or the table list view, depending on the
 * persisted viewMode. The TopBar / DecisionQueue / panels overlay both.
 */
function ViewSurface(): JSX.Element {
  const viewMode = useSolixStore((s) => s.viewMode);
  return viewMode === 'list' ? <ListView /> : <Scene />;
}

function EmptyHint(): JSX.Element | null {
  const sessionCount = useSolixStore(
    (s) => Object.keys(s.sessions).length,
  );
  const connected = useSolixStore((s) => s.connected);
  if (sessionCount > 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
      <div className="rounded-lg border border-solix-border bg-solix-panel p-6 max-w-md text-center backdrop-blur">
        <div className="text-sm uppercase tracking-widest text-solix-accent">
          empty system
        </div>
        <div className="mt-2 text-slate-200">
          {connected
            ? 'Run `claude` in any terminal — the planet will appear here.'
            : 'Waiting for the Solix server…'}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          The sun is mission control. Each agent orbits it as a planet.
        </div>
      </div>
    </div>
  );
}
