# Capturing launch screenshots

The galaxy is a live WebGL scene, so the marketing shots have to be captured
from a real browser (a headless/CI browser renders the 3D view black). It
takes about two minutes with the built-in demo — no real Claude Code needed.

## Fastest path — the capture script

`scripts/capture-shots.mjs` drives a **headed** browser (headed is required —
WebGL is black headless) and grabs the framed shots with the exact filenames
the README expects. One-time, install the browser it drives:

```sh
npx playwright install chromium
```

Then, with the demo running in another terminal:

```sh
solix demo            # terminal 1
pnpm capture          # terminal 2  → writes docs/galaxy.png, advisors.png, galaxy-panel.png
```

It captures the hero, the crew ring, and the Galaxy panel automatically.
`decision-queue.png` still needs one manual click (a flaring planet) — see
below. Prefer the fully-manual recipe? It's here too.

## 1. Boot the demo

```sh
solix demo            # fully synthetic, sandboxed DB, opens the browser
```

The galaxy fills in immediately: ~30 sessions across 8 projects, all 14
advisors, missions, comets, permission flares, and a live ticker. For a
still, calm frame use `solix demo --no-ticker` (seeds once, no animation).

## 2. Frame and shoot

In the browser tab (http://127.0.0.1:4242):

- Press **F** to fit every planet in view.
- Hide DevTools; go full-screen for a clean frame.

Capture these and drop them in `docs/` with these exact names (the README
references them):

| File | What to show |
| --- | --- |
| `docs/galaxy.png` | The hero — the whole galaxy, sun centered, planets fanned out. |
| `docs/decision-queue.png` | Click a red (awaiting-permission) planet so its side panel opens, with the Decision Queue beside it. |
| `docs/advisors.png` | Open the Crew panel (**C**) or click an advisor ring planet. |

macOS: **Cmd+Shift+4** then space to grab the window. Save as PNG.

## 3. (Optional) An animated GIF

The live ticker (comets firing, planets drifting between rings) is the best
motion. Record ~8–10s of the running demo and export a GIF:

```sh
# macOS: record the browser window with QuickTime, then convert:
ffmpeg -i screen.mov -vf "fps=15,scale=1200:-1:flags=lanczos" -loop 0 docs/demo.gif
```

Keep it under ~5 MB so it renders inline on GitHub/npm.
