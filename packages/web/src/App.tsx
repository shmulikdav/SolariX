import { useEffect } from 'react';
import { Scene } from './scene/Scene.js';
import { TopBar } from './hud/TopBar.js';
import { Toasts } from './hud/Toasts.js';
import { PermissionTray } from './hud/PermissionTray.js';
import { SidePanel } from './panels/SidePanel.js';
import { useSolixStore } from './store/index.js';
import { startWsClient } from './ws/client.js';

export default function App(): JSX.Element {
  useEffect(() => {
    startWsClient();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const state = useSolixStore.getState();
      const pending = Object.values(state.pendingPermissions);
      const top = pending[0];

      if (e.key === 'Escape') {
        state.selectSession(null);
      } else if (top && (e.key === 'y' || e.key === 'Y')) {
        state.resolvePermission(top.requestId, true);
      } else if (top && (e.key === 'n' || e.key === 'N')) {
        state.resolvePermission(top.requestId, false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Scene />
      <TopBar />
      <PermissionTray />
      <SidePanel />
      <Toasts />
      <EmptyHint />
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
