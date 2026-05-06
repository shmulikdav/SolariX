# Solix

A solar-system command center for Claude Code agents.

[![npm version](https://img.shields.io/npm/v/@shmulikdav/solix.svg)](https://www.npmjs.com/package/@shmulikdav/solix)
[![npm downloads](https://img.shields.io/npm/dm/@shmulikdav/solix.svg)](https://www.npmjs.com/package/@shmulikdav/solix)
[![license](https://img.shields.io/npm/l/@shmulikdav/solix.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@shmulikdav/solix.svg)](https://nodejs.org)

```sh
npm i -g @shmulikdav/solix
solix install && solix start
```

Solix renders every running Claude Code session as a planet orbiting a central
sun. You see all your agents at once, click any planet to inspect its mission
log, and react to permission requests without context-switching between
terminals.

> **Status:** M0–M1 foundation + a built-in crew of 10 advisor agents
> (Compass · Forge · Lumen · Argus · Sentinel + 5 opt-in), a real skills
> asteroid belt, and shareable galaxies (local file or opt-in cloud
> registry). M2 visual polish, M3 transcript-tail mission log, and M3.5
> internal-session launcher are next.

## Quick start

The easiest path — install from npm:

```sh
npm i -g @shmulikdav/solix
solix install        # patches ~/.claude/settings.json
solix start          # serves API + WS + UI on http://127.0.0.1:4242
```

Open **http://127.0.0.1:4242** — you'll get a Welcome modal walking
you through five things you can do.

**See it without running Claude Code yet?** In another terminal:

```sh
solix demo
```

Seeds three user planets, an active mission with comet streaks, a moon,
a red permission flare, and pins Compass — so the empty galaxy lights
up immediately.

Then run `claude` in any terminal and a real planet will appear within
a second.

To verify the install: `solix doctor`. To remove cleanly: `solix
uninstall`.

> **Native dep note:** Solix uses `better-sqlite3`. Most platforms get a
> prebuilt binary on `npm install`. If yours doesn't, npm will compile
> from source — that needs a working C++ toolchain (`xcode-select
> --install` on macOS, `build-essential` on Linux, VS Build Tools on
> Windows).

### From source (contributors)

```sh
pnpm install
pnpm --filter @solix/web prepare-assets     # CC-licensed textures (~3 MB)
pnpm -r build
node packages/cli/dist/index.js install     # or: alias solix='node ...dist/index.js'
node packages/cli/dist/index.js start
```

`prepare-assets` is opt-in. With textures present, the sun gets a real
surface, the 5 default advisors render as bespoke planets (Compass=Saturn
with rings, Forge=Mars, Lumen=Earth, Argus=Jupiter, Sentinel=Moon), and
the sky becomes a Milky Way panorama. Without them, the scene falls back
to a procedural look — Solix still works fully.

## Architecture

```
Claude Code  ──hook scripts──▶  Solix server (Hono + ws + SQLite)  ──WebSocket──▶  Browser (React + R3F)
                                              │
                                              └─▶ ~/.solix/solix.db
```

| Layer | Package | Tech |
|---|---|---|
| Types & protocol | `@solix/shared` | TypeScript |
| HTTP/WS server | `@solix/server` | Hono · `ws` · better-sqlite3 |
| Web UI | `@solix/web` | React · react-three-fiber · drei · Tailwind · Zustand |
| CLI | `@shmulikdav/solix` | commander · open |
| Hook scripts | `packages/cli/hooks/*.sh` | POSIX sh + curl |

Hook scripts have three load-bearing properties:

1. `--max-time 1` — never block Claude Code if Solix is down
2. `|| true` followed by `exit 0` — the hook can never fail the agent's action
3. stdout/stderr redirected — hooks must not pollute Claude's output

## Mapping (the metaphor *is* the product)

| Concept | Visual |
|---|---|
| User / mission control | Sun |
| Project / workspace | Solar system |
| Claude Code session | Planet |
| Subagent (Task tool) | Moon orbiting its planet |
| **Built-in advisor (PM, Builder, UX, …)** | **Inner crew ring planet near the sun** |
| **Pinned advisor (always-on)** | **Outer planet with gold accent ring** |
| **Skill (Anthropic + Solix pack)** | **Asteroid in the outer belt** |
| Active session | Bright emissive, faster orbit |
| `awaiting_permission` | Red pulsing flare |
| `awaiting_input` | Yellow flare |
| `plan_review` | Saturn-like ring |
| Tool call | Comet streak |
| Context usage | Planet size (0.55 → 1.05) |
| Model | Surface color (opus=purple, sonnet=blue, haiku=cyan) |

## Advisors — the built-in crew

Solix ships 10 advisor agents installed into `~/.claude/agents/`:

| # | Codename | Role | Default |
|---|---|---|---|
| 1 | Compass | Product Manager | enabled |
| 2 | Forge | Builder | enabled |
| 3 | Lumen | UX/UI Designer | enabled |
| 4 | Argus | Code Reviewer | enabled |
| 5 | Sentinel | Security Auditor | enabled |
| 6 | Mira | Test Engineer / QA | opt-in |
| 7 | Echo | Devrel / Docs | opt-in |
| 8 | Helios | Performance Engineer | opt-in |
| 9 | Vale | Release Engineer | opt-in |
| 10 | Atlas | Skill Curator | opt-in |

```sh
solix advisors list
solix advisors enable mira
solix advisors pin compass     # always-on planet (uses real claude binary;
                               # set SOLIX_FAKE_CLAUDE=1 for synthetic dev mode)
solix advisors unpin compass
```

In the browser, click an advisor in the inner ring to open its panel: read
its system prompt, hand it a brief, and Invoke it on the focused planet.

## Skills — the asteroid belt

Solix discovers SKILL.md manifests from two sources:

- `~/.claude/skills/` — the upstream Anthropic catalog
- `~/.solix/skills/` — Solix's bundled pack (4 skills:
  `mission-summary`, `permission-explainer`, `galaxy-publish`,
  `advisor-prompt`)

```sh
solix skills list
solix skills install solix:mission-summary --project <projectId>
```

Click any asteroid in the browser to read the manifest and see which
advisors require it.

## Galaxies — share your space

A galaxy is a portable JSON manifest of your enabled advisors, discovered
skills, and known projects. Each user runs Solix locally; galaxies move
between users.

**Local file (no servers):**

```sh
solix galaxy export ./my-setup.galaxy.json --name "Indie Hacker"
solix galaxy import ./my-setup.galaxy.json
solix galaxy import https://gist.githubusercontent.com/.../my.galaxy.json
```

**Opt-in cloud registry:** point Solix at any HTTP registry that speaks
`PUT /v1/galaxies/:slug` and `GET /v1/galaxies/:slug`:

```sh
export SOLIX_REGISTRY_URL=https://registry.example.com
export SOLIX_REGISTRY_KEY=...
solix start

# anywhere, anytime
solix galaxy publish shmulik/dev --name "Shmulik Dev"
solix galaxy install shmulik/dev
```

**Safety property of imports:** they only flip advisor `enabled` flags and
record project hints. They never spawn pinned advisors, run shell commands,
auto-install skills to the filesystem, or schedule tasks. You stay in
control.

## Custom textures (optional)

By default Solix runs `prepare-assets` to pull a small set of
CC-licensed planet + sky textures (~3 MB total) from public CDNs:

| Texture | Used by | Source |
|---|---|---|
| `milky_way.jpg` | Sky | jsDelivr — `jeromeetienne/threex.planets` (galaxy_starfield) |
| `sun.jpg` | The sun | jsDelivr — `jeromeetienne/threex.planets` |
| `saturn.jpg` + `saturn_ring.png` | Compass advisor | jsDelivr — `jeromeetienne/threex.planets` |
| `mars.jpg` | Forge advisor | jsDelivr — `jeromeetienne/threex.planets` |
| `earth.jpg` + `earth_clouds.png` | Lumen advisor | three.js examples |
| `jupiter.jpg` | Argus advisor | jsDelivr — `jeromeetienne/threex.planets` |
| `moon.jpg` | Sentinel advisor | three.js examples |

The fetch script tries multiple mirrors; if any download fails, the
scene falls back gracefully — missing textures revert to procedural
spheres, no errors. Run `pnpm --filter @solix/web prepare-assets`
again any time to re-attempt.

To swap any texture for your own (e.g., a higher-res version from
[solarsystemscope.com/textures](https://www.solarsystemscope.com/textures/) —
their site is gated behind Cloudflare so manual download is the path),
drop a replacement file with the same name into
`packages/web/public/textures/`. The file is gitignored so it won't be
committed.

## Context management

Solix is opinionated about how context flows between agents.

**Mission summaries are the handoff currency, not transcripts.** Every
mission produces a `shortName` + (eventually) a `longSummary`. When you
Invoke an advisor, Solix builds a **context envelope** — a small,
structured prompt — by stitching together:

- the advisor's role description (from its `.md` file),
- the focused planet's `cwd`, model, status, and current context %,
- the last 3 missions on that planet (summary + files touched + tool
  counts),
- a role-specific default ask if you didn't write a brief,
- a budget warning if the target session is ≥80% (suggest /compact at
  ≥90%).

This is the cheapest possible handoff: an advisor gets enough to be
useful without the cost of replaying full transcripts.

You can preview the envelope before sending — it shows up as an
expandable section in the AdvisorPanel, or via:

```sh
curl 'http://127.0.0.1:4242/api/advisors/compass/preview?targetSessionId=<id>'
```

**Visual context warnings:**

| Context % | Visual |
|---|---|
| <80% | Planet at normal size |
| 80–89% | Orange flare, slow pulse |
| ≥90% | Red flare, faster pulse + planet visibly bloated |

**Source of truth for `contextUsagePct`:** the field exists on every
session and is wired through the WebSocket `context_update` message. The
*populator* — a transcript-tail watcher on
`~/.claude/projects/<project>/<session>.jsonl` — is the next chunk of
work (PRD §5.5, M3). For now the field can be set via `setContextUsage()`
in the router and is updated by the demo seeder.

## Development

```sh
pnpm dev               # parallel: server + web
pnpm typecheck         # all packages
pnpm --filter @solix/server dev    # server only on :4242
pnpm --filter @solix/web dev       # vite dev server on :4243
```

Vite proxies `/api`, `/events`, and `/ws` to the server, so hitting
http://127.0.0.1:4243 in dev gives you HMR for the UI while the server runs
separately.

### Sending fake hook events

Useful while building visuals without spinning up a real Claude session:

```sh
curl -s -X POST http://127.0.0.1:4242/events \
  -H 'Content-Type: application/json' \
  -d '{"event":"session_start","pid":1234,"cwd":"'$PWD'","ts":'$(date +%s%3N)',
       "payload":{"session_id":"demo-1","model":"opus"}}'

curl -s -X POST http://127.0.0.1:4242/events \
  -H 'Content-Type: application/json' \
  -d '{"event":"user_prompt_submit","pid":1234,"cwd":"'$PWD'","ts":'$(date +%s%3N)',
       "payload":{"session_id":"demo-1","prompt":"refactor the math"}}'
```

## Layout

```
solix/
├── packages/
│   ├── shared/   # types + protocol shared across server/web/cli
│   ├── server/   # Hono + WebSocket + SQLite + event router + launcher + cloud
│   ├── web/      # React + react-three-fiber solar system + advisor ring + asteroid belt
│   ├── cli/      # commander entrypoint + hook scripts
│   ├── agents/   # canonical .md files for 10 advisor agents (+ manifest.json)
│   └── skills/   # the bundled Solix skill pack (4 SKILL.md manifests)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Roadmap

V1 ships in milestones (see PRD §12). M0+M1 foundation is in place.
Remaining V1 work: M2 visual polish, M3 side-panel transcript tail,
M3.5 internal-session launcher, M4 mission summaries + Quest Board,
M5 npm publish.
