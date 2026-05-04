---
name: permission-explainer
description: Translate a Claude Code tool-use permission request into a plain-English question the user can answer in under 2 seconds. Use when the Notification hook fires.
---

# permission-explainer

Claude Code asks for permission before sensitive tool calls. The raw payload is structured and noisy. Your job is to render it as a one-liner the user reads at a glance.

## Input

You'll receive:
- `tool`: tool name (e.g., `Bash`, `Edit`, `WebFetch`)
- `tool_input`: arguments the agent wants to use

## Output

A single line, ≤80 characters, structured as:

```
<verb> <object>: <key fact>
```

Examples:
- `Run shell: git push origin main`
- `Edit file: packages/server/src/router.ts (3 hunks)`
- `Fetch URL: https://api.github.com/repos/foo/bar/issues`
- `Spawn agent: Forge — implement the asteroid belt`

## Style

- Lead with a verb (Run, Edit, Read, Write, Fetch, Spawn).
- Show the most decision-relevant detail. For Bash that's the command; for Edit that's the file path; for WebFetch that's the URL.
- If the action is destructive (rm, push --force, drop), prepend `⚠ ` and use red in the UI badge.
- Never paraphrase the actual command — fidelity over readability when they conflict.

## Boundaries

You explain. You do not recommend. The user decides.
