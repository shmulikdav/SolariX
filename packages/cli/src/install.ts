import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_BACKUP,
  CLAUDE_DIR,
  CLAUDE_SETTINGS,
  HOOK_NAMES,
  HOOKS_DIR,
  SOLIX_HOME,
  packagedHooksDir,
} from './paths.js';

interface HookEntry {
  matcher: string;
  hooks: { type: 'command'; command: string }[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

function readSettings(): ClaudeSettings {
  if (!existsSync(CLAUDE_SETTINGS)) return {};
  try {
    const txt = readFileSync(CLAUDE_SETTINGS, 'utf8');
    return JSON.parse(txt) as ClaudeSettings;
  } catch (err) {
    console.warn(`[solix] could not parse ${CLAUDE_SETTINGS}: ${String(err)}`);
    return {};
  }
}

function hookCommand(name: string): string {
  return `${HOOKS_DIR}/${name}.sh`;
}

function buildSolixHooks(): Record<string, HookEntry[]> {
  return {
    SessionStart: [
      { matcher: '*', hooks: [{ type: 'command', command: hookCommand('session-start') }] },
    ],
    UserPromptSubmit: [
      { matcher: '*', hooks: [{ type: 'command', command: hookCommand('prompt-submit') }] },
    ],
    Stop: [{ matcher: '*', hooks: [{ type: 'command', command: hookCommand('stop') }] }],
    SubagentStop: [
      { matcher: '*', hooks: [{ type: 'command', command: hookCommand('subagent-stop') }] },
    ],
    PreToolUse: [
      { matcher: 'Task', hooks: [{ type: 'command', command: hookCommand('pre-tool-task') }] },
      {
        matcher: 'Read|Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: hookCommand('pre-tool-file') }],
      },
      { matcher: 'Bash', hooks: [{ type: 'command', command: hookCommand('pre-tool-bash') }] },
    ],
    PostToolUse: [
      { matcher: '*', hooks: [{ type: 'command', command: hookCommand('post-tool') }] },
    ],
    Notification: [
      { matcher: '*', hooks: [{ type: 'command', command: hookCommand('notification') }] },
    ],
  };
}

function isSolixHook(entry: HookEntry): boolean {
  return entry.hooks.some((h) => h.command.includes(`${HOOKS_DIR}/`));
}

function mergeHooks(
  existing: Record<string, HookEntry[]> | undefined,
  solix: Record<string, HookEntry[]>,
): Record<string, HookEntry[]> {
  const merged: Record<string, HookEntry[]> = { ...(existing ?? {}) };
  for (const [evt, solixEntries] of Object.entries(solix)) {
    const userEntries = (merged[evt] ?? []).filter((e) => !isSolixHook(e));
    merged[evt] = [...userEntries, ...solixEntries];
  }
  return merged;
}

function installHookScripts(): void {
  mkdirSync(HOOKS_DIR, { recursive: true });
  const src = packagedHooksDir();
  if (!existsSync(src)) {
    throw new Error(
      `Solix hook scripts not found at ${src}. Did the package build correctly?`,
    );
  }
  for (const name of HOOK_NAMES) {
    const from = join(src, `${name}.sh`);
    const to = join(HOOKS_DIR, `${name}.sh`);
    copyFileSync(from, to);
    chmodSync(to, 0o755);
  }
}

export interface InstallOptions {
  force?: boolean;
}

export function install(opts: InstallOptions = {}): void {
  mkdirSync(SOLIX_HOME, { recursive: true });
  mkdirSync(CLAUDE_DIR, { recursive: true });

  const existing = readSettings();
  if (existsSync(CLAUDE_SETTINGS) && !existsSync(CLAUDE_BACKUP)) {
    copyFileSync(CLAUDE_SETTINGS, CLAUDE_BACKUP);
    console.log(`[solix] backed up settings.json -> ${CLAUDE_BACKUP}`);
  } else if (opts.force && existsSync(CLAUDE_SETTINGS)) {
    copyFileSync(CLAUDE_SETTINGS, CLAUDE_BACKUP);
  }

  installHookScripts();
  console.log(`[solix] installed hook scripts in ${HOOKS_DIR}`);

  const merged = mergeHooks(existing.hooks, buildSolixHooks());
  const next: ClaudeSettings = { ...existing, hooks: merged };
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(next, null, 2) + '\n');
  console.log(`[solix] merged hooks into ${CLAUDE_SETTINGS}`);
}
