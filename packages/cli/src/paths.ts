import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOLIX_HOME = process.env.SOLIX_HOME ?? join(homedir(), '.solix');
export const HOOKS_DIR = join(SOLIX_HOME, 'hooks');
export const CLAUDE_DIR = join(homedir(), '.claude');
export const CLAUDE_SETTINGS = join(CLAUDE_DIR, 'settings.json');
export const CLAUDE_BACKUP = join(CLAUDE_DIR, 'settings.solix.backup.json');

export const HOOK_NAMES = [
  'session-start',
  'prompt-submit',
  'stop',
  'subagent-stop',
  'pre-tool-task',
  'pre-tool-file',
  'pre-tool-bash',
  'post-tool',
  'notification',
] as const;

export function packagedHooksDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up looking for a hooks/ directory containing session-start.sh.
  // Handles: dist/hooks (built), packages/cli/hooks (dev/workspace).
  const candidates = [
    join(here, 'hooks'),
    join(here, '..', 'hooks'),
    join(here, '..', '..', 'hooks'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'session-start.sh'))) return p;
  }
  return candidates[0]!;
}
