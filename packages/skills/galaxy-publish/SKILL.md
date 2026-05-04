---
name: galaxy-publish
description: Package the current Solix configuration into a portable galaxy.solix.yml manifest. Use when the user wants to share their Solix setup with another machine or person.
---

# galaxy-publish

A "galaxy" is a portable description of someone's Solix setup: which advisor agents they have enabled, which skills are installed, which projects they orbit, and any scheduled tasks.

## What to include

Read from the local Solix server:
- `GET /api/advisors` — emit `{ role, pinned, model }` per enabled advisor
- `GET /api/skills` — emit `{ id, source }` per known skill
- `GET /api/projects` — emit `{ name, cwd }` per project
- `GET /api/scheduled-tasks` (when present)

## What NOT to include

- Mission contents (private user data)
- Tool-call arguments (may contain shell commands, secrets)
- File contents from `filesTouched`
- API keys, registry tokens, anything from `~/.claude/credentials.json`

## Output

A YAML document conforming to the `GalaxyManifest` schema in `@solix/shared`. Sort keys deterministically so the same config produces a byte-identical file across machines (good for diffing).

## Boundaries

You package. You do not publish. The CLI's `solix galaxy publish` is what actually pushes to the registry; this skill's only job is to produce the manifest.
