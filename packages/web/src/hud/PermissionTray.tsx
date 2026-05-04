import { useSolixStore } from '../store/index.js';

export function PermissionTray(): JSX.Element | null {
  const pending = useSolixStore((s) => s.pendingPermissions);
  const sessions = useSolixStore((s) => s.sessions);
  const resolve = useSolixStore((s) => s.resolvePermission);
  const select = useSolixStore((s) => s.selectSession);

  const items = Object.values(pending);
  if (!items.length) return null;

  return (
    <div className="absolute top-20 right-4 w-80 z-30 flex flex-col gap-2">
      {items.map((p) => {
        const session = sessions[p.sessionId];
        const name = session?.name ?? p.sessionId.slice(0, 8);
        return (
          <div
            key={p.requestId}
            className="rounded border border-solix-danger bg-solix-danger/10 p-3 backdrop-blur"
          >
            <button
              onClick={() => select(p.sessionId)}
              className="block text-xs uppercase tracking-wide text-solix-danger hover:underline"
            >
              {name} · permission
            </button>
            <div className="mt-1 text-sm text-slate-100 break-words">
              <span className="font-semibold">{p.tool}</span>
              <span className="ml-1 text-slate-300 text-xs">
                {summarizeArgs(p.args)}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => resolve(p.requestId, true)}
                className="flex-1 py-1.5 rounded bg-solix-ok/20 border border-solix-ok text-solix-ok text-xs hover:bg-solix-ok/30"
              >
                Approve (Y)
              </button>
              <button
                onClick={() => resolve(p.requestId, false)}
                className="flex-1 py-1.5 rounded bg-solix-danger/20 border border-solix-danger text-solix-danger text-xs hover:bg-solix-danger/30"
              >
                Deny (N)
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (!keys.length) return '';
  const summarized = keys.slice(0, 2).map((k) => {
    const v = args[k];
    const s =
      typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${s.length > 32 ? s.slice(0, 32) + '…' : s}`;
  });
  return summarized.join(' · ');
}
