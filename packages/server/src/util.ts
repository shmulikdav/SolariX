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

/**
 * Turn a human project name into a safe directory slug: lowercase, spaces and
 * punctuation collapsed to single hyphens, trimmed. Falls back to 'project' so
 * the result is never empty (e.g. a name of only symbols).
 */
export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'project';
}
