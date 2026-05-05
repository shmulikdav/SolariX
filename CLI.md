# Solix CLI — operator's guide

The `solix` command is your one entry point for installing hooks,
running the server, seeding demos, managing advisors and skills,
sharing galaxies, and diagnosing problems. This doc walks every
sub-command in the order you'd actually use them.

> **TL;DR**
>
> ```
> solix install       # one-time: wire Claude Code hooks
> solix start         # boot the server (default port 4242)
> solix demo          # seed fake planets to play with
> solix doctor        # diagnose if something's off
> ```

---

## Contents

1. [Install & first run](#1-install--first-run)
2. [Running the server](#2-running-the-server)
3. [Seeding the demo](#3-seeding-the-demo)
4. [Managing advisors](#4-managing-advisors)
5. [Managing skills](#5-managing-skills)
6. [Galaxy sharing](#6-galaxy-sharing)
7. [Diagnostics](#7-diagnostics)
8. [Uninstall](#8-uninstall)
9. [Environment variables](#9-environment-variables)
10. [Common workflows](#10-common-workflows)
11. [Troubleshooting](#11-troubleshooting)

---

## 0. How `solix` is invoked

The CLI binary is `solix`, defined by `packages/cli/package.json:bin`.
You can run it three ways:

| Context | Command |
|---|---|
| Published / globally installed | `solix <cmd>` |
| From a monorepo checkout, after `pnpm -r build` | `node packages/cli/dist/index.js <cmd>` |
| Inside the workspace, no global install | `pnpm --filter @shmulikdav/solix exec solix <cmd>` |

Anywhere this guide says `solix …`, substitute the form that fits
your setup. Example:

```sh
# Published install
solix start

# Monorepo checkout
node packages/cli/dist/index.js start
```

---

## 1. Install & first run

### `solix install`

Wires Solix's hook scripts into `~/.claude/settings.json` so every
Claude Code session you run anywhere on your machine will report its
events back to the Solix server.

```sh
solix install
```

**Flags:**

| Flag | Effect |
|---|---|
| `--force` | Overwrite existing hooks even if some Solix entries are already present. Use after upgrading. |

**What it does, concretely:**

1. Backs up `~/.claude/settings.json` to a timestamped file
   (`settings.json.solix.bak.<ts>`).
2. Adds Solix's pre-tool, post-tool, session-start, and session-end
   hooks to the `hooks` array.
3. Each hook is a one-line `curl` to `http://127.0.0.1:4242/events`
   with `--max-time 1` and `exit 0` so a slow or stopped Solix server
   never blocks Claude Code.

**Run this once per machine.** Re-run with `--force` after upgrading
the CLI if hook contents change.

---

## 2. Running the server

### `solix start`

Boots the local server (HTTP + WebSocket), serves the web UI on the
same port, and opens your browser by default.

```sh
solix start
```

**Flags:**

| Flag | Default | Effect |
|---|---|---|
| `-p, --port <port>` | `4242` | Port to listen on (HTTP, WS, and static UI all use this). |
| `--no-open` | (open) | Do not open a browser tab automatically. |

**Output you should see:**

```
[solix] server listening on http://127.0.0.1:4242
[solix] events  -> POST http://127.0.0.1:4242/events
[solix] ws      -> ws://127.0.0.1:4242/ws
[solix] open http://127.0.0.1:4242 in your browser to view
```

`Ctrl+C` shuts down cleanly. Solix persists everything to a SQLite DB
under `~/.solix/solix.db` (WAL mode), so restarts pick up where you
left off.

`start` is the **default** sub-command — running plain `solix` is
equivalent.

---

## 3. Seeding the demo

### `solix demo`

Pushes a synthetic snapshot to a running Solix server: three demo
planets with different models, an active mission, a moon (subagent),
a pending permission, and a pinned advisor. Great for first-look
walkthroughs without launching real Claude Code sessions.

```sh
solix demo
```

**Flags:**

| Flag | Default | Effect |
|---|---|---|
| `-p, --port <port>` | `4242` | Port the running server is on. |

**Prereq:** the server must be running (`solix start` in another
terminal). The seeder POSTs to `http://127.0.0.1:<port>/events`.

**What appears in the UI:**

- **demo-a** — opus, 62% context, active, refactoring orbital math.
- **demo-b** — sonnet, 87% context, active, has a moon (subagent).
- **demo-c** — haiku, idle, **awaiting permission** for `git push
  origin main` (red pulse).
- **Compass** — pinned advisor in the inner ring.

Re-run safely; the seeder is idempotent enough for a refresh.

---

## 4. Managing advisors

The crew (Compass, Forge, Lumen, Argus, Sentinel + opt-in roles)
ship in `packages/agents`. They're stored in your DB on first server
boot, then managed via these commands or the AdvisorPanel in the UI.

### `solix advisors list`

Prints a table of every advisor — id, role, codename, enabled,
pinned.

```sh
solix advisors list
# also works as the default: `solix advisors`
```

### `solix advisors enable <id>`

Renders the advisor in the inner crew ring (and makes it Invokable).
Does NOT spawn a process.

```sh
solix advisors enable compass
```

### `solix advisors disable <id>`

Removes from the inner ring. Safe — does not delete history. Cannot
disable a core advisor that's required for system invariants; see
the source if you hit a refusal.

```sh
solix advisors disable mira
```

### `solix advisors pin <id>`

Always-on advisor. Spawns a long-lived Claude Code process tagged
with the advisor's role + AGENT.md. Appears as a planet that orbits
near the sun.

```sh
solix advisors pin argus
```

### `solix advisors unpin <id>`

Stops the long-lived process and removes the planet. The advisor
remains enabled (Invokable on demand).

```sh
solix advisors unpin argus
```

---

## 5. Managing skills

Skills are unit-of-knowledge folders with a `SKILL.md`. Solix
discovers them in `~/.claude/skills` and `packages/skills`. They
appear as the asteroid belt.

### `solix skills list`

Print all known skills with id, name, source (`anthropic | solix |
user`), and description.

```sh
solix skills list
# default: `solix skills`
```

### `solix skills install <id>`

Mark a skill as installed for a project. The skill stays discovered
either way; "install" just records intent in the DB so the project
sees that skill as part of its toolkit.

```sh
solix skills install file-utilities --project <projectId>
```

**Flags:**

| Flag | Effect |
|---|---|
| `--project <projectId>` | Project to install into. Project IDs are hash(cwd); see UI or `~/.solix/solix.db` for IDs. |

---

## 6. Galaxy sharing

A "galaxy" is a JSON manifest describing which advisors are
enabled/pinned, which skills are present, and which projects the
machine knows about. Galaxies are how you copy a configured Solix
across machines or share with teammates.

### `solix galaxy export <out>`

Write the current configuration to a `.galaxy.json` file.

```sh
solix galaxy export my-team.galaxy.json \
  --name "Backend Team" \
  --author "shmulik" \
  --description "Argus-pinned, security-skills-installed"
```

**Flags:**

| Flag | Effect |
|---|---|
| `--name <name>` | Human label inside the manifest. Default `My Galaxy`. |
| `--author <author>` | Optional author string. |
| `--description <desc>` | Optional one-line description. |

**Side effect:** also creates a row in `galaxy_versions` so the
Versions tab in the UI can diff this snapshot against future ones
(byte-identical re-exports are deduped).

### `solix galaxy import <fileOrUrl>`

Apply a manifest from a local file path or a `https://…` URL.

```sh
solix galaxy import ./team.galaxy.json
solix galaxy import https://example.com/galaxies/team.galaxy.json
```

**What it touches:** advisor enable/disable flags, skill registry
entries, project hints. **Never** auto-pins, auto-installs skills,
or runs shell commands — those still require a deliberate action.

### `solix galaxy publish <slug>`

Publish to the configured registry (if you've set one up). The slug
is the public name the registry will use to look up the galaxy.

```sh
solix galaxy publish backend-team \
  --name "Backend Team" \
  --author "shmulik"
```

### `solix galaxy install <slug>`

Pull a galaxy from the configured registry by slug.

```sh
solix galaxy install backend-team
```

> Both `publish` and `install` require a registry URL configured in
> your environment. If no registry is configured, prefer the file /
> URL forms above.

---

## 7. Diagnostics

### `solix doctor`

One-shot health check. Prints ✓/✗ for each dependency.

```sh
solix doctor
```

**Checks performed:**

- `~/.claude/settings.json` exists and contains Solix hooks
- Solix DB is readable
- The agent manifest at `packages/agents/manifest.json` is valid
- The Solix server is running on `SOLIX_PORT` (default 4242) — calls
  `/api/health`
- Optional: `claude` is on PATH (your launcher works)

Run this any time things feel off: server not picking up sessions,
hooks silent, etc.

---

## 8. Uninstall

### `solix uninstall`

Restores `~/.claude/settings.json` from the most recent
`.solix.bak.<ts>` backup. Does **not** touch your Solix DB or skill
folders.

```sh
solix uninstall
```

To wipe everything: `rm -rf ~/.solix/` after running uninstall.

---

## 9. Environment variables

| Var | Effect | Example |
|---|---|---|
| `SOLIX_PORT` | Default port for `start` and `doctor`. | `SOLIX_PORT=5000 solix start` |
| `SOLIX_FAKE_CLAUDE` | When `1`, the launcher does NOT actually spawn `claude`. Instead it emits synthetic transcript content. Useful for UI-only testing without burning tokens. | `SOLIX_FAKE_CLAUDE=1 solix start` |
| `SOLIX_DB_PATH` | (If present in your build) override the SQLite path. Default `~/.solix/solix.db`. | `SOLIX_DB_PATH=/tmp/solix-test.db solix start` |
| `PATH` | Must include `claude` for live launching. Solix's preflight (`/api/system/preflight`) reads this; the New Task modal warns when `claude` is missing. | — |

---

## 10. Common workflows

### A. First-time setup on a new machine

```sh
# 1. Get the binary on PATH (one of):
npm i -g @shmulikdav/solix
# or, in a checkout: pnpm -r build

# 2. Wire hooks
solix install

# 3. Boot
solix start

# 4. (optional) play with seed data without burning tokens
solix demo
```

### B. Daily use

Just run `solix start` once at the top of your day, leave it open,
and run `claude` as usual in any project. Planets appear in the UI
within a second of each session starting. `Ctrl+C` to stop.

### C. Demo for a teammate

```sh
solix start &           # Terminal 1 (or in a tmux pane)
solix demo              # Terminal 2
# Open http://127.0.0.1:4242 in their browser
# Tell them: press G for Galaxy panel, V to switch views, Y to
# approve the pending permission.
```

### D. Save and replay your team config

```sh
# On the source machine:
solix advisors pin argus
solix advisors enable mira
solix galaxy export ~/team.galaxy.json --name "Backend Team"

# On the destination:
solix galaxy import ~/team.galaxy.json
# Then explicitly:
solix advisors pin argus    # imports never auto-pin
```

### E. UI-only development (no real `claude`)

```sh
SOLIX_FAKE_CLAUDE=1 solix start
solix demo
# UI works; "Launch a task" emits synthetic content instead of spawning
# claude. Frees you from token costs while iterating on UI.
```

### F. Inspect or edit the DB directly

```sh
sqlite3 ~/.solix/solix.db
.tables
SELECT * FROM advisors;
.quit
```

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `solix start` exits immediately with `EADDRINUSE` | Another process on 4242 | `lsof -i :4242` then kill it, or `solix start --port 5000` |
| Browser shows `OFFLINE` (red) | Server not running, or wrong port | Run `solix doctor`; confirm the server logs and the URL |
| `claude` runs but no planet appears | Hooks not installed or not pointing to the right port | `solix doctor` will flag missing hooks; re-run `solix install --force` |
| New Task modal shows "claude not found on the server's PATH" | The shell that started `solix` doesn't have `claude` | Restart the server from a shell where `which claude` works |
| `solix demo` reports network error | The server isn't running or is on a different port | `solix start` first; or pass `solix demo --port 5000` if you changed it |
| Galaxy import didn't pin advisors | By design — imports never auto-pin | Run `solix advisors pin <id>` explicitly after import |
| Versions tab keeps growing on every export | A real change happened each time, OR you're running with `?preview=1` (which is the no-snapshot path) | Identical re-exports are deduped server-side; if not, file an issue |
| UI shows old layout after `pnpm -r build` | Browser cached the old bundle | Hard reload (cmd-shift-R) |
| Hooks silently dropping events | Server stopped while sessions were running | The hooks are fail-open by design (`--max-time 1`, `exit 0`) so they don't block Claude Code; restart the server, future events flow again |

---

## See also

- `DEMO.md` — non-technical first-look walkthrough
- `DEMO_PM.md` — for product managers
- `DEMO_DEV.md` — for developers
- `README.md` — architecture, metaphor, roadmap
