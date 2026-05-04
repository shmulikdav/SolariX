import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
