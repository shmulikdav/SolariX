#!/usr/bin/env node
// Downloads CC-licensed planet + sky textures so Solix's scene can use real
// imagery instead of pure-color spheres. Idempotent: skips files already
// present. Falls back across multiple public mirrors and prints clear manual
// instructions if nothing fetches — the scene gracefully reverts to the
// procedural look when textures are missing.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEX_DIR = join(HERE, '..', 'public', 'textures');

const MIN_BYTES = 30_000;

/** Each entry: where it goes + ordered list of public-domain / CC sources. */
const ASSETS = [
  {
    file: 'milky_way.jpg',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/galaxy_starfield.png',
    ],
    purpose: 'Equirectangular Milky Way / starfield panorama (sky)',
  },
  {
    file: 'sun.jpg',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/sunmap.jpg',
    ],
    purpose: 'Sun surface texture',
  },
  {
    file: 'saturn.jpg',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/saturnmap.jpg',
    ],
    purpose: 'Saturn body — Compass advisor',
    minBytes: 5_000, // saturnmap is small but valid
  },
  {
    file: 'saturn_ring.png',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/saturnringcolor.jpg',
    ],
    purpose: 'Saturn ring color (used as alpha-tinted plane)',
    minBytes: 5_000,
  },
  {
    file: 'mars.jpg',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/marsmap1k.jpg',
    ],
    purpose: 'Mars body — Forge advisor',
  },
  {
    file: 'earth.jpg',
    sources: [
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    ],
    purpose: 'Earth body — Lumen advisor',
  },
  {
    file: 'earth_clouds.png',
    sources: [
      'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    ],
    purpose: 'Earth cloud overlay',
  },
  {
    file: 'jupiter.jpg',
    sources: [
      'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/jupitermap.jpg',
    ],
    purpose: 'Jupiter body — Argus advisor',
  },
  {
    file: 'moon.jpg',
    sources: [
      'https://threejs.org/examples/textures/planets/moon_1024.jpg',
    ],
    purpose: 'Moon body — Sentinel advisor',
  },
];

function alreadyHave(file, minBytes) {
  const path = join(TEX_DIR, file);
  if (!existsSync(path)) return false;
  try {
    return statSync(path).size > (minBytes ?? MIN_BYTES);
  } catch {
    return false;
  }
}

async function tryDownload(url, minBytes) {
  process.stdout.write(`  ${url} ... `);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      process.stdout.write(`HTTP ${res.status}\n`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const cap = minBytes ?? MIN_BYTES;
    if (buf.length < cap) {
      process.stdout.write(`too small (${buf.length}B < ${cap}B)\n`);
      return null;
    }
    process.stdout.write(`ok (${(buf.length / 1024).toFixed(0)} KB)\n`);
    return buf;
  } catch (err) {
    process.stdout.write(`failed: ${err.message ?? err}\n`);
    return null;
  }
}

async function fetchAsset(asset) {
  if (alreadyHave(asset.file, asset.minBytes)) {
    console.log(`[fetch-textures] ${asset.file} already present, skipping.`);
    return true;
  }
  console.log(`[fetch-textures] ${asset.file} (${asset.purpose}):`);
  for (const url of asset.sources) {
    const buf = await tryDownload(url, asset.minBytes);
    if (buf) {
      const out = join(TEX_DIR, asset.file);
      writeFileSync(out, buf);
      console.log(`[fetch-textures] saved -> ${out}`);
      return true;
    }
  }
  return false;
}

function writeManualReadme(missing) {
  const out = join(TEX_DIR, 'README.md');
  const lines = [
    '# Solix textures',
    '',
    'These textures were not fetched automatically. The scene falls back to',
    'a procedural look if they are missing — Solix still works without them.',
    '',
    "If you'd like the realistic look, drop the following files into",
    `\`${TEX_DIR}\`:`,
    '',
    ...missing.map(
      (a) => `- **${a.file}** — ${a.purpose}\n  Try: ${a.sources[0]}`,
    ),
    '',
    'Sources we recommend for manual download:',
    '',
    '- https://www.solarsystemscope.com/textures/ (CC BY 4.0; cloudflare-gated)',
    '- https://github.com/jeromeetienne/threex.planets (MIT)',
    '- https://threejs.org/examples/textures/planets/',
    '',
    'Re-run `pnpm --filter @solix/web prepare-assets` after dropping files in;',
    'it will detect them and exit without re-downloading.',
    '',
  ];
  writeFileSync(out, lines.join('\n'));
}

async function main() {
  mkdirSync(TEX_DIR, { recursive: true });

  const missing = [];
  let fetched = 0;
  for (const asset of ASSETS) {
    const ok = await fetchAsset(asset);
    if (ok) fetched += 1;
    else missing.push(asset);
  }

  console.log('');
  console.log(
    `[fetch-textures] ${fetched}/${ASSETS.length} textures available in ${TEX_DIR}`,
  );

  if (missing.length > 0) {
    writeManualReadme(missing);
    console.warn(
      `[fetch-textures] ${missing.length} texture(s) could not be fetched.`,
    );
    console.warn(
      `[fetch-textures] Manual download instructions written to ${TEX_DIR}/README.md`,
    );
    console.warn(
      '[fetch-textures] The scene falls back to its procedural look for any missing texture.',
    );
    // Exit 0 — missing textures are non-fatal.
  }
}

await main();
