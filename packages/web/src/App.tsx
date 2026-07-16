import { lazy, Suspense, useEffect, useState } from 'react';
import { ListView } from './hud/ListView.js';
import { MissionView } from './hud/MissionView.js';
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
import { NewTaskModal } from './panels/NewTaskModal.js';
import { useSolixStore } from './store/index.js';
import { startWsClient } from './ws/client.js';

// Sprint K code-split: the 3D galaxy scene pulls three.js, drei, and
// postprocessing — together the largest chunk of the bundle. Lazy-load
// it so a user who lands directly on List view doesn't pay that cost.
// Same for the Timeline drawer (only opened on demand) and the Galaxy
// panel (which has its own fetch + state).
const Scene = lazy(() =>
  import('./scene/Scene.js').then((m) => ({ default: m.Scene })),
);
const TimelineDrawer = lazy(() =>
  import('./hud/TimelineDrawer.js').then((m) => ({ default: m.TimelineDrawer })),
);
const GalaxyPanel = lazy(() =>
  import('./panels/GalaxyPanel.js').then((m) => ({ default: m.GalaxyPanel })),
);
const CrewPanel = lazy(() =>
  import('./panels/CrewPanel.js').then((m) => ({ default: m.CrewPanel })),
);

export default function App(): JSX.Element {
  const [galaxyOpen, setGalaxyOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);

  // Width of whichever right-side panel is open, so the DecisionQueue can
  // sit beside it instead of overlapping. Numbers match each panel's w-[…].
  const selectedSessionId = useSolixStore((s) => s.selectedSessionId);
  const selectedAdvisorId = useSolixStore((s) => s.selectedAdvisorId);
  const selectedSkillId = useSolixStore((s) => s.selectedSkillId);
  const panelOffsetPx = selectedSessionId
    ? 460
    : selectedAdvisorId
      ? 420
      : selectedSkillId
        ? 480
        : galaxyOpen
          ? 480
          : 0;

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
        setHelpOpen(false);
        setCrewOpen(false);
        // Esc also exits Timeline Playback — the only mode where the rest of
        // the UI feels frozen because state is derived from past events.
        // Cheap escape hatch when the "× Live" button isn't clickable for
        // any reason (e.g. a third-party window overlay).
        if (state.playback.active) {
          state.exitPlayback();
          setTimelineOpen(false);
        }
      } else if (!isTextField && e.key === '?') {
        setHelpOpen((v) => !v);
      } else if (!isTextField && (e.key === 'g' || e.key === 'G')) {
        setGalaxyOpen((v) => !v);
      } else if (!isTextField && (e.key === 'c' || e.key === 'C')) {
        setCrewOpen((v) => !v);
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
      } else if (!isTextField && (e.key === 'm' || e.key === 'M')) {
        state.setViewMode('missions');
      } else if (!isTextField && (e.key === 't' || e.key === 'T')) {
        setTimelineOpen((v) => !v);
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
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenCrew={() => setCrewOpen(true)}
      />
      <DecisionQueue panelOffsetPx={panelOffsetPx} />
      <SidePanel />
      <AdvisorPanel />
      <SkillPanel />
      {galaxyOpen && (
        <Suspense fallback={null}>
          <GalaxyPanel open={galaxyOpen} onClose={() => setGalaxyOpen(false)} />
        </Suspense>
      )}
      {crewOpen && (
        <Suspense fallback={null}>
          <CrewPanel open={crewOpen} onClose={() => setCrewOpen(false)} />
        </Suspense>
      )}
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
      />
      {timelineOpen && (
        <Suspense fallback={null}>
          <TimelineDrawer
            open={timelineOpen}
            onClose={() => setTimelineOpen(false)}
          />
        </Suspense>
      )}
      <SceneControls />
      <Welcome
        onOpenGalaxy={() => setGalaxyOpen(true)}
        forceOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
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
  if (viewMode === 'list') return <ListView />;
  if (viewMode === 'missions') return <MissionView />;
  // The 3D galaxy chunk is loaded on demand. Show a quiet loader so
  // the screen doesn't go blank during the ~hundreds-of-ms first
  // paint while three.js downloads.
  return (
    <Suspense fallback={<SceneLoading />}>
      <Scene />
    </Suspense>
  );
}

function SceneLoading(): JSX.Element {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-solix-bg z-0">
      <div className="text-xs text-slate-500 uppercase tracking-widest solix-pulse">
        loading galaxy…
      </div>
    </div>
  );
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
