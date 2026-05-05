# Solix

> A solar-system command center for Claude Code agents.

Every running `claude` session becomes a planet orbiting the sun.
Status is encoded as visual properties — color (model), halo
(role/status), size (context %), pulse (needs attention). Click a
planet to read its transcript; press `Y` to approve a sensitive
permission without leaving the browser.

![status: 1.0.0](https://img.shields.io/badge/status-1.0.0-blue)
![license: MIT](https://img.shields.io/badge/license-MIT-green)

## Install

```sh
npm i -g @shmulikdav/solix
```

Requires Node ≥ 20. The package bundles a built React UI and the
advisor crew manifest, so a single `npm install` gives you
everything.

## Quick start

```sh
solix install        # one-time: wires Claude Code hooks
solix start          # boot the server (default port 4242)
# In another terminal:
solix demo           # seed 3 planets to play with
```

Open `http://127.0.0.1:4242`. Press `Y` to approve the demo's
pending permission. You're now driving Claude Code agents from a
mission-control UI.

## Common commands

```sh
solix install           # wire hooks into ~/.claude/settings.json
solix start             # default sub-command; boot server + serve UI
solix demo              # synthetic seed for first-look demos
solix doctor            # diagnose your setup
solix advisors list     # see the built-in crew (Compass, Forge, ...)
solix advisors pin <id> # always-on advisor planet
solix galaxy export <out>      # snapshot config to JSON
solix galaxy import <fileOrUrl># apply a snapshot
solix uninstall         # restore ~/.claude/settings.json
```

Every command has `-h` / `--help`.

## Native dependency note

Solix uses `better-sqlite3` for local persistence. On most platforms
(macOS, Linux, Windows) npm pulls a prebuilt binary — no compile
step. If your platform isn't covered, npm will compile from source,
which needs a working C++ toolchain (`xcode-select --install` /
`build-essential` / Visual Studio Build Tools).

## Documentation

The full docs live in the GitHub repo:

- **CLI reference** — every flag of every sub-command
- **Operating guide** — task-oriented "I want to do X" recipes
- **README** — architecture and metaphor
- **DEMO walkthroughs** — for non-technical, PM, and developer
  audiences

→ <https://github.com/shmulikdav/solarix>

## License

MIT — see `LICENSE`.
