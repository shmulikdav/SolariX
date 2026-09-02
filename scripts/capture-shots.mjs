#!/usr/bin/env node
// Automated launch-shot capture for Solix.
//
// The galaxy is a live WebGL scene, so this MUST run HEADED on a machine with a
// real GPU — a headless/CI browser renders the 3D view black (see CAPTURE.md).
// It drives the built-in demo, so no real Claude Code is needed.
//
// One-time setup (installs the browser Playwright drives):
//   npx playwright install chromium
//
// Usage:
//   1. In one terminal:   solix demo        (boots the synthetic galaxy)
//   2. In another:        node scripts/capture-shots.mjs   (or: pnpm capture)
//
// Options (env vars):
//   SOLIX_URL   dashboard URL            (default http://127.0.0.1:4242)
//   SHOT_DIR    output directory         (default ./docs)
//   SCALE       deviceScaleFactor        (default 2 — retina-crisp PNGs)
//   SETTLE_MS   pause after each action  (default 2500 — lets WebGL settle)

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const BASE = process.env.SOLIX_URL ?? 'http://127.0.0.1:4242';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR ? resolve(process.env.SHOT_DIR) : join(ROOT, 'docs');
const SCALE = Number(process.env.SCALE ?? 2);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 2500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await serverUp())) {
    console.error(`✗ No Solix server answering at ${BASE}`);
    console.error(`  Start the demo first, then re-run this script:`);
    console.error(`    solix demo`);
    process.exit(1);
  }
  await mkdir(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: SCALE,
  });

  console.log(`→ ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Wait for the WebGL canvas to mount, then let the scene warm up (the demo
  // fans planets into their orbits and starts the ticker over the first second).
  await page.waitForSelector('canvas', { timeout: 15000 });
  await sleep(SETTLE_MS + 1500);

  const shot = async (name) => {
    await page.screenshot({ path: join(SHOT_DIR, name) });
    console.log(`  ✓ ${name}`);
  };
  const key = async (k) => {
    await page.keyboard.press(k);
    await sleep(SETTLE_MS);
  };

  // 1) Hero — the demo boots with the whole system framed; shoot it as-is.
  // (Press `0` first if you've nudged the camera; the default pose frames well.)
  await shot('galaxy.png');

  // 2) Crew — open the advisor-ring panel (C), shoot, then close.
  await key('c');
  await shot('advisors.png');
  await key('Escape');

  // 3) Galaxy panel — the share/import view (G), shoot, then close.
  await key('g');
  await shot('galaxy-panel.png');
  await key('Escape');

  await browser.close();

  console.log('');
  console.log(`Saved to ${SHOT_DIR}`);
  console.log('One shot is still manual (it needs a click on a flaring planet):');
  console.log('  decision-queue.png — click a red awaiting-permission planet so its');
  console.log('  side panel opens beside the Decision Queue, then grab the window.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
