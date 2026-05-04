import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const SOLIX_HOME =
  process.env.SOLIX_HOME ?? join(homedir(), '.solix');

export const DB_PATH = join(SOLIX_HOME, 'solix.db');
export const HOOKS_DIR = join(SOLIX_HOME, 'hooks');
export const LOG_PATH = join(SOLIX_HOME, 'solix.log');

export function ensureSolixHome(): void {
  mkdirSync(SOLIX_HOME, { recursive: true });
  mkdirSync(HOOKS_DIR, { recursive: true });
}
