import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_BACKUP,
  CLAUDE_SETTINGS,
  HOOKS_DIR,
  HOOK_NAMES,
  SOLIX_HOME,
} from './paths.js';

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

async function probeHealth(port: number): Promise<CheckResult> {
  const url = `http://127.0.0.1:${port}/api/health`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) {
      return { ok: false, label: 'Server reachable', detail: `HTTP ${res.status}` };
    }
    return { ok: true, label: 'Server reachable', detail: url };
  } catch (err) {
    return {
      ok: false,
      label: 'Server reachable',
      detail: `not running on ${url}`,
    };
  }
}

export async function doctor(): Promise<void> {
  const port = Number(process.env.SOLIX_PORT ?? 4242);
  const checks: CheckResult[] = [];

  const nodeVersion = process.versions.node;
  const major = Number(nodeVersion.split('.')[0]);
  checks.push({
    ok: major >= 20,
    label: 'Node.js >= 20',
    detail: `v${nodeVersion}`,
  });

  checks.push({
    ok: existsSync(SOLIX_HOME),
    label: 'Solix home directory',
    detail: SOLIX_HOME,
  });

  let allHooksPresent = true;
  const missing: string[] = [];
  for (const name of HOOK_NAMES) {
    const p = join(HOOKS_DIR, `${name}.sh`);
    if (!existsSync(p)) {
      allHooksPresent = false;
      missing.push(name);
      continue;
    }
    try {
      statSync(p);
    } catch {
      allHooksPresent = false;
      missing.push(name);
    }
  }
  checks.push({
    ok: allHooksPresent,
    label: 'Hook scripts installed',
    detail: allHooksPresent
      ? `${HOOK_NAMES.length} scripts in ${HOOKS_DIR}`
      : `missing: ${missing.join(', ')}`,
  });

  checks.push({
    ok: existsSync(CLAUDE_SETTINGS),
    label: 'Claude settings.json present',
    detail: CLAUDE_SETTINGS,
  });

  checks.push({
    ok: existsSync(CLAUDE_BACKUP),
    label: 'Backup of settings.json',
    detail: existsSync(CLAUDE_BACKUP) ? CLAUDE_BACKUP : 'not yet created',
  });

  checks.push(await probeHealth(port));

  console.log('\nSolix Diagnostics\n');
  let allOk = true;
  for (const c of checks) {
    const icon = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const detail = c.detail ? `  \x1b[2m${c.detail}\x1b[0m` : '';
    console.log(`${icon} ${c.label}${detail}`);
    if (!c.ok) allOk = false;
  }
  console.log('');
  if (allOk) {
    console.log('All checks passed. Solix is healthy.\n');
  } else {
    console.log(
      'Some checks failed. Run `solix install` and `solix start` to fix common issues.\n',
    );
    process.exitCode = 1;
  }
}
