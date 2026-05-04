---
name: mission-summary
description: Generate a thematic 3-word name and a 1-sentence summary for a Solix mission. Use when a mission completes (Stop hook) or when the user asks for a recap of recent work.
---

# mission-summary

When invoked you'll receive context about a single Solix mission: the original prompt, the list of files touched, the count of tool calls, the count of subagents spawned, and the duration.

## Output format

Return exactly two fields in plain text, one per line, no prose around them:

```
NAME: <three-word title in Title Case, 18 chars max>
SUMMARY: <one sentence, ≤120 chars, focus on the *outcome* not the activity>
```

## Style

- The three-word name should be evocative but accurate. Prefer "Orbital Math Polish" over "Refactoring Numbers".
- The summary describes what the user can now do, not what code moved. "Planets now scale with context usage" beats "Edited Planet.tsx".
- No emoji. No exclamation marks. No marketing language.
- If the mission failed, lead the summary with the failure mode: "Aborted: …".

## Boundaries

You are summarizing, not evaluating. Do not editorialize on whether the mission was a good idea or how it could have been done better — that's **Compass**'s job, not yours.
