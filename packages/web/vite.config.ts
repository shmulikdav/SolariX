import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the CLI package's version at build time so the web bundle can
// display it (lets users see at a glance which version is rendering,
// vs guessing from `solix --version` + browser cache state).
const cliPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../cli/package.json'), 'utf8'),
) as { version: string };
const SOLIX_VERSION = cliPkg.version;

export default defineConfig({
  define: {
    __SOLIX_VERSION__: JSON.stringify(SOLIX_VERSION),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Generate placeholder icons at build time using vite-plugin-pwa's
      // pwaAssets workflow would be ideal, but for V1 we ship two square
      // PNGs from public/icons/ and call it good.
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Solix — solar-system command center',
        short_name: 'Solix',
        description:
          'A solar-system command center for Claude Code agents. Watch every running session as a planet.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0e1a',
        theme_color: '#7c5cff',
        icons: [
          {
            src: '/icons/solix-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/solix-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/solix-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache the app shell so the dashboard renders briefly while the
        // server is restarting. WebSocket and /api/* always go to the
        // network — we don't want stale state masquerading as live data.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg}'],
        navigateFallbackDenylist: [/^\/api/, /^\/events/, /^\/ws/],
      },
    }),
  ],
  server: {
    port: 4243,
    proxy: {
      '/api': 'http://127.0.0.1:4242',
      '/events': 'http://127.0.0.1:4242',
      '/ws': {
        target: 'ws://127.0.0.1:4242',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
