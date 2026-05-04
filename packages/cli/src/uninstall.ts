import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CLAUDE_BACKUP, CLAUDE_SETTINGS, HOOKS_DIR } from './paths.js';

interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

export function uninstall(): void {
  if (existsSync(CLAUDE_BACKUP)) {
    copyFileSync(CLAUDE_BACKUP, CLAUDE_SETTINGS);
    console.log(`[solix] restored settings.json from backup`);
    return;
  }

  if (!existsSync(CLAUDE_SETTINGS)) {
    console.log('[solix] nothing to uninstall (no settings.json found)');
    return;
  }

  const cur = JSON.parse(
    readFileSync(CLAUDE_SETTINGS, 'utf8'),
  ) as ClaudeSettings;
  if (cur.hooks) {
    for (const [evt, entries] of Object.entries(cur.hooks)) {
      cur.hooks[evt] = entries.filter(
        (e) => !e.hooks.some((h) => h.command.includes(HOOKS_DIR)),
      );
      if (cur.hooks[evt].length === 0) delete cur.hooks[evt];
    }
  }
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(cur, null, 2) + '\n');
  console.log(`[solix] removed Solix hooks from ${CLAUDE_SETTINGS}`);
}
