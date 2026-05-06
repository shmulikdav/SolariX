/// <reference types="vite/client" />

/**
 * Injected by vite.config.ts at build time from packages/cli/package.json.
 * Always reflects the version the user actually has loaded — surfaces in
 * TopBar + Welcome so we never have to guess again.
 */
declare const __SOLIX_VERSION__: string;
