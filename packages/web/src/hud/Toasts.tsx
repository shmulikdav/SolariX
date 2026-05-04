import { useSolixStore } from '../store/index.js';

export function Toasts(): JSX.Element {
  const toasts = useSolixStore((s) => s.toasts);
  const dismiss = useSolixStore((s) => s.dismissToast);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-30">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto px-3 py-2 rounded text-xs border max-w-md text-left ${
            t.level === 'error'
              ? 'bg-solix-danger/10 border-solix-danger text-solix-danger'
              : t.level === 'warn'
                ? 'bg-solix-warn/10 border-solix-warn text-solix-warn'
                : 'bg-solix-panel border-solix-border text-slate-200'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
