import { useEffect, useState } from 'react';

export interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean; // <640px (Tailwind sm breakpoint)
  isTablet: boolean; // 640..1024px
}

function read(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800, isMobile: false, isTablet: false };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    width: w,
    height: h,
    isMobile: w < 640,
    isTablet: w >= 640 && w < 1024,
  };
}

/**
 * Returns the current viewport size + mobile/tablet flags. Reactive on
 * window resize. Used by App.tsx to swap fixed sidebars for full-screen
 * drawers on small screens, and by TopBar to collapse counters.
 */
export function useViewportSize(): ViewportSize {
  const [v, setV] = useState<ViewportSize>(() => read());
  useEffect(() => {
    const onResize = (): void => setV(read());
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return v;
}
