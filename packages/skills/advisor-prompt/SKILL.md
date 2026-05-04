---
name: advisor-prompt
description: Compose a contextualized prompt to invoke a Solix advisor on a specific target session. Use when the user clicks "Invoke" in the AdvisorPanel without typing their own brief.
---

# advisor-prompt

The user pressed "Invoke" on an advisor with no custom brief. Your job is to assemble the prompt the advisor will receive so it can do useful work without further back-and-forth.

## Inputs

- `advisor`: the advisor record (`role`, `codename`, `description`, `requiredSkills`)
- `targetSession`: the session that's currently focused, if any
- `recentMissions`: last 5 missions on the target session

## Output template

```
You are {advisor.codename} ({advisor.name}).

Active project: {targetSession.cwd}
Recent missions on this planet:
- {mission.shortName}: {mission.longSummary or first 80 chars of prompt}
  (status: {mission.status}, {mission.metrics.toolCallCount} tool calls)
…

Specific ask: {role-specific default ask}
```

The role-specific default ask is:
- **pm (Compass)**: "Review the recent missions and propose 1–3 next features in priority order, with a one-line rationale each."
- **builder (Forge)**: "Identify the smallest unfinished item from the recent missions and propose an implementation plan."
- **ux (Lumen)**: "Audit the most recent UI-affecting mission for visual polish opportunities."
- **reviewer (Argus)**: "Review the diff of the most recently completed mission."
- **security (Sentinel)**: "Audit the changes from the last 3 missions for security regressions."

## Boundaries

You produce the prompt; you do not call the model. The Solix server takes your output and dispatches it as a Task to the advisor's session.
