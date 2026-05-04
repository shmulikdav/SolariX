# Solix

A solar-system command center for Claude Code agents.

Solix renders every running Claude Code session as a planet orbiting a central
sun. You see all your agents at once, click any planet to inspect its mission
log, and react to permission requests without context-switching between
terminals.

> **Status:** M0+M1 foundation. Full hook pipeline → SQLite → WebSocket → 3D
> scene works end-to-end. M2+ visual richness, M3 side-panel chat, and M3.5
> internal-session launcher are next.

## Quick start

```sh
pnpm install
pnpm --filter @shmulikdav/solix exec tsx src/index.ts install   # patches ~/.claude/settings.json
pnpm --filter @shmulikdav/solix exec tsx src/index.ts start     # opens http://127.0.0.1:4242
```

Then run `claude` in any terminal — a planet will appear within a second.

To verify the install:

```sh
pnpm --filter @shmulikdav/solix exec tsx src/index.ts doctor
```

To remove the integration cleanly:

```sh
pnpm --filter @shmulikdav/solix exec tsx src/index.ts uninstall
```

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
| Active session | Bright emissive, faster orbit |
| `awaiting_permission` | Red pulsing flare |
| `awaiting_input` | Yellow flare |
| `plan_review` | Saturn-like ring |
| Tool call | Comet streak |
| Context usage | Planet size (0.55 → 1.05) |
| Model | Surface color (opus=purple, sonnet=blue, haiku=cyan) |

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
│   ├── server/   # Hono + WebSocket + SQLite + event router
│   ├── web/      # React + react-three-fiber solar system
│   └── cli/      # commander entrypoint + hook scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Roadmap

V1 ships in milestones (see PRD §12). M0+M1 foundation is in place.
Remaining V1 work: M2 visual polish, M3 side-panel transcript tail,
M3.5 internal-session launcher, M4 mission summaries + Quest Board,
M5 npm publish.
