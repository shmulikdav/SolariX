import { useEffect, useState } from 'react';

/**
 * Detects when the running Solix server is newer than the UI bundle the
 * browser is currently rendering — the classic "I upgraded Solix but still see
 * the old version" trap caused by a stale service worker / cached shell.
 *
 * The version string in the top bar (`__SOLIX_VERSION__`) is baked into the JS
 * bundle at build time, while /api/health reports the *running server's*
 * version. When they diverge, the page is stale: we surface a banner offering a
 * one-click hard refresh (unregister service workers + clear caches + reload)
 * so the user never has to hunt through DevTools to see a shipped fix.
 *
 * Poll-based (not push) so it also catches an upgrade that happened while the
 * tab was open. Best-effort throughout — any fetch/SW/cache error is ignored.
 */
export function UpdateBanner(): JSX.Element | null {
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (!cancelled && typeof data.version === 'string') {
          setServerVersion(data.version);
        }
      } catch {
        /* server momentarily unreachable; try again next tick */
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const bundleVersion = __SOLIX_VERSION__;
  const stale =
    serverVersion !== null &&
    serverVersion !== 'unknown' &&
    serverVersion !== bundleVersion;

  if (!stale || dismissed) return null;

  const hardRefresh = async (): Promise<void> => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* best-effort — reload anyway */
    }
    window.location.reload();
  };

  return (
    <div className="absolute top-0 inset-x-0 z-[60] flex items-center justify-center gap-3 bg-solix-accent text-white text-xs px-4 py-2 shadow-lg">
      <span>
        Solix <span className="font-semibold">v{serverVersion}</span> is running,
        but you're viewing the older{' '}
        <span className="font-semibold">v{bundleVersion}</span> interface.
      </span>
      <button
        onClick={() => void hardRefresh()}
        className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 font-semibold"
      >
        Reload
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
