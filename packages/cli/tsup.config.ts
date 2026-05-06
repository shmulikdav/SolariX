import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

// Read this package's own version at build time so the bundled `solix
// --version` always reflects what was published. Previously the version
// was hardcoded as '1.0.0' in src/index.ts and never updated — making
// it impossible to tell which version a user actually had installed.
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

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
  define: {
    __SOLIX_VERSION__: JSON.stringify(pkg.version),
  },
  // No banner — src/index.ts already starts with #!/usr/bin/env node,
  // and tsup preserves it. A second banner line would break Node.
});
