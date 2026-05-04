#!/usr/bin/env node
// Downloads a free CC0 Milky Way HDRI from Polyhaven so the Solix scene
// can use it as the sky. Idempotent: exits 0 if the file is already present.
//
// Why a fetch script instead of bundling the .hdr in the repo?
// - The .hdr is a binary asset (~1.7 MB) — bloats every clone whether or
//   not the user wants the HDRI sky.
// - The asset is opt-in. If the file isn't present, the scene falls back
//   to a flat dark background via a <Suspense fallback>.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', 'public', 'hdri');
const TARGET = join(PUBLIC_DIR, 'milky_way_2k.hdr');

// Polyhaven CC0 night HDRIs with the Milky Way clearly visible.
// `dikhololo_night` is the canonical "stars + Milky Way arch" sky;
// the others are quieter fallbacks if the primary 404s.
const SOURCES = [
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/dikhololo_night_2k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/satara_night_no_lamps_2k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/moonless_golf_2k.hdr',
];

const RADIANCE_MAGIC = '#?RADIANCE';

function alreadyHave() {
  if (!existsSync(TARGET)) return false;
  try {
    const size = statSync(TARGET).size;
    return size > 100_000;
  } catch {
    return false;
  }
}

async function tryDownload(url) {
  process.stdout.write(`[fetch-hdri] GET ${url} ... `);
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    process.stdout.write(`HTTP ${res.status}\n`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000) {
    process.stdout.write(`too small (${buf.length}B)\n`);
    return null;
  }
  const head = buf.subarray(0, RADIANCE_MAGIC.length).toString('ascii');
  if (head !== RADIANCE_MAGIC) {
    process.stdout.write(`not a Radiance HDR (head=${JSON.stringify(head)})\n`);
    return null;
  }
  process.stdout.write(`ok (${(buf.length / 1024).toFixed(0)} KB)\n`);
  return buf;
}

async function main() {
  if (alreadyHave()) {
    console.log(`[fetch-hdri] already present at ${TARGET}, skipping.`);
    return;
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const url of SOURCES) {
    try {
      const buf = await tryDownload(url);
      if (buf) {
        writeFileSync(TARGET, buf);
        console.log(`[fetch-hdri] saved -> ${TARGET}`);
        return;
      }
    } catch (err) {
      console.warn(`[fetch-hdri] ${url} failed: ${String(err)}`);
    }
  }
  console.error(
    '[fetch-hdri] all sources failed. The scene will fall back to the dark default sky.',
  );
  console.error(
    '[fetch-hdri] To install manually, drop any .hdr file at:',
    TARGET,
  );
  process.exitCode = 1;
}

await main();
