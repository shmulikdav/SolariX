import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        solix: {
          bg: '#05060c',
          // Solid (no alpha) so Tailwind opacity modifiers like
          // `bg-solix-panel/95` actually compose. When this carried baked-in
          // alpha (rgba(...,0.8)), every panel was capped at 80% opaque and
          // the 3D scene bled through panel text. See fix/panel-opacity-bleed.
          panel: '#0f1220',
          border: 'rgba(120, 130, 200, 0.18)',
          accent: '#a855f7',
          warn: '#f59e0b',
          danger: '#ef4444',
          ok: '#10b981',
        },
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
