import { createHash } from 'node:crypto';
import { basename } from 'node:path';

export function hashCwd(cwd: string): string {
  return createHash('sha1').update(cwd).digest('hex').slice(0, 12);
}

export function projectNameFromCwd(cwd: string): string {
  return basename(cwd) || cwd;
}

export function now(): number {
  return Date.now();
}
