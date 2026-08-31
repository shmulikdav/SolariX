import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, '..');
const repoRoot = resolve(cliRoot, '..', '..');
const distRoot = join(cliRoot, 'dist');

const trees = [
  {
    label: 'hooks',
    src: join(cliRoot, 'hooks'),
    dst: join(distRoot, 'hooks'),
    fatal: true,
  },
  {
    label: 'web',
    src: join(repoRoot, 'packages', 'web', 'dist'),
    dst: join(distRoot, 'web'),
    fatal: true,
  },
  {
    label: 'agents',
    src: join(repoRoot, 'packages', 'agents'),
    dst: join(distRoot, 'agents'),
    fatal: true,
  },
  {
    label: 'skills',
    src: join(repoRoot, 'packages', 'skills'),
    dst: join(distRoot, 'skills'),
    fatal: true,
  },
];

for (const { label, src, dst, fatal } of trees) {
  if (!existsSync(src)) {
    const msg = `[copy-static] source missing: ${src} — run \`pnpm -r build\` first`;
    if (fatal) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    continue;
  }
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`[copy-static] ${label}: ${src} -> ${dst}`);
}
