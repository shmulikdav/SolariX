import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        solix: {
          bg: '#05060c',
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
