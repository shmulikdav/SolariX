import { useState } from 'react';
import { useSolixStore } from '../store/index.js';

interface ImportResponse {
  ok: boolean;
  advisorsEnabled: number;
  advisorsDisabled: number;
  projectsHinted: number;
  error?: string;
}

interface GalaxyPanelProps {
  open: boolean;
  onClose: () => void;
}

export function GalaxyPanel({
  open,
  onClose,
}: GalaxyPanelProps): JSX.Element | null {
  const [name, setName] = useState('My Galaxy');
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const sessionsCount = useSolixStore(
    (s) => Object.keys(s.sessions).length,
  );
  const advisorsEnabledCount = useSolixStore(
    (s) => Object.values(s.advisors).filter((a) => a.enabled).length,
  );
  const skillsCount = useSolixStore((s) => Object.keys(s.skills).length);

  if (!open) return null;

  const onExport = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ name });
      const res = await fetch(`/api/galaxy/export?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      const blob = new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.galaxy.json`;
      a.click();
      URL.revokeObjectURL(url);
      setResult('Downloaded.');
    } catch (err) {
      setResult(`Export failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const submitImport = async (body: BodyInit): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/galaxy/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = (await res.json()) as ImportResponse;
      if (data.ok) {
        setResult(
          `Imported: ${data.advisorsEnabled} enabled, ${data.advisorsDisabled} disabled, ${data.projectsHinted} projects.`,
        );
        setImportText('');
        setImportUrl('');
      } else {
        setResult(`Import failed: ${data.error ?? 'unknown'}`);
      }
    } catch (err) {
      setResult(`Import failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onImportText = (): void => {
    void submitImport(importText);
  };

  const onImportUrl = (): void => {
    void submitImport(JSON.stringify({ url: importUrl }));
  };

  return (
    <div className="absolute top-0 right-0 h-full w-[480px] bg-solix-panel border-l border-solix-border backdrop-blur-md flex flex-col z-30">
      <div className="px-4 py-3 border-b border-solix-border flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-solix-accent">
            Galaxy
          </div>
          <div className="text-lg font-semibold">Share your space</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {advisorsEnabledCount} advisors · {skillsCount} skills ·{' '}
            {sessionsCount} sessions
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Export
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Galaxy name"
            className="w-full text-sm bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent"
          />
          <button
            onClick={() => void onExport()}
            disabled={busy}
            className="mt-2 w-full py-2 rounded bg-solix-accent/20 border border-solix-accent text-solix-accent text-sm hover:bg-solix-accent/30 disabled:opacity-50"
          >
            Download manifest (.galaxy.json)
          </button>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Import from URL
          </div>
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://… or local server URL"
            className="w-full text-sm bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent"
          />
          <button
            onClick={onImportUrl}
            disabled={busy || !importUrl.trim()}
            className="mt-2 w-full py-2 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-sm hover:bg-cyan-500/25 disabled:opacity-50"
          >
            Pull and import
          </button>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Import from JSON
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste a galaxy manifest JSON here…"
            rows={10}
            className="w-full text-xs bg-black/40 border border-solix-border rounded p-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-solix-accent font-mono resize-none"
          />
          <button
            onClick={onImportText}
            disabled={busy || !importText.trim()}
            className="mt-2 w-full py-2 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-sm hover:bg-cyan-500/25 disabled:opacity-50"
          >
            Apply manifest
          </button>
        </section>

        {result && (
          <div className="text-xs text-slate-300 border border-solix-border rounded p-2 bg-black/30">
            {result}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-solix-border text-xs text-slate-500">
        Imports never spawn pinned advisors or run shell commands. You're in
        control.
      </div>
    </div>
  );
}
