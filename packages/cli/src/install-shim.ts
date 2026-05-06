import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const BLOCK_START = '# >>> solix shim >>>';
const BLOCK_END = '# <<< solix shim <<<';

function detectShellRcPath(): string | null {
  const shell = process.env.SHELL ?? '';
  const home = homedir();
  // Order of preference matches what most users would expect.
  if (shell.endsWith('zsh') || existsSync(join(home, '.zshrc'))) {
    return join(home, '.zshrc');
  }
  if (shell.endsWith('bash') || existsSync(join(home, '.bashrc'))) {
    return join(home, '.bashrc');
  }
  if (existsSync(join(home, '.bash_profile'))) {
    return join(home, '.bash_profile');
  }
  return null;
}

function readRc(rcPath: string): string {
  return existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : '';
}

function blockText(): string {
  return [
    BLOCK_START,
    '# Aliases `claude` to `solix run` so every claude session is wrapped',
    '# by Solix. The Solix UI composer becomes write-enabled for these.',
    "# Remove with `solix uninstall` (or delete this block manually).",
    "alias claude='solix run'",
    BLOCK_END,
    '',
  ].join('\n');
}

export function installShim(): void {
  const rcPath = detectShellRcPath();
  if (!rcPath) {
    console.error(
      "[solix] couldn't find a shell rc file (.zshrc / .bashrc). " +
        "Add `alias claude='solix run'` manually to your shell config.",
    );
    process.exitCode = 1;
    return;
  }

  const current = readRc(rcPath);
  if (current.includes(BLOCK_START)) {
    console.log(`[solix] shim already installed in ${rcPath}`);
    return;
  }

  const prefix = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  appendFileSync(rcPath, prefix + '\n' + blockText());
  console.log(`[solix] shim added to ${basename(rcPath)}.`);
  console.log(
    `[solix] run \`exec $SHELL\` (or open a new terminal) to activate, ` +
      `then \`claude\` will route through \`solix run\`.`,
  );
}

/**
 * Removes the shim block if present. Called from `solix uninstall` so a
 * full removal restores the user's pre-Solix shell exactly.
 */
export function uninstallShim(): boolean {
  const rcPath = detectShellRcPath();
  if (!rcPath) return false;
  const current = readRc(rcPath);
  if (!current.includes(BLOCK_START)) return false;

  const startIdx = current.indexOf(BLOCK_START);
  const endIdx = current.indexOf(BLOCK_END);
  if (endIdx < 0) return false;
  // Strip the block and any trailing blank line that the install left.
  const before = current.slice(0, startIdx).replace(/\n+$/, '\n');
  const after = current.slice(endIdx + BLOCK_END.length).replace(/^\n+/, '');
  writeFileSync(rcPath, before + after);
  console.log(`[solix] shim removed from ${basename(rcPath)}.`);
  return true;
}
