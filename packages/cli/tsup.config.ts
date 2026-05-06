import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  // Bundle the workspace packages (server + shared) into the CLI so the
  // published package is a single installable artifact. Real npm deps
  // (hono, better-sqlite3, etc.) stay external and resolve at runtime.
  noExternal: [/^@solix\//],
  // No banner — src/index.ts already starts with #!/usr/bin/env node,
  // and tsup preserves it. A second banner line would break Node.
});
