import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'hooks');
const dst = join(here, '..', 'dist', 'hooks');

if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`[copy-hooks] copied ${src} -> ${dst}`);
} else {
  console.warn(`[copy-hooks] source missing: ${src}`);
}
