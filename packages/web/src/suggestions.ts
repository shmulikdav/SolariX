import type { Mission, Session } from '@solix/shared';

export interface Suggestion {
  text: string;
  severity: 'info' | 'warn' | 'danger';
}

/**
 * Heuristic decision-helper. Looks at a pending permission's tool + args
 * and returns a one-liner the user can read in <2s.
 *
 * V1 is rule-based — easy to read, easy to extend, and doesn't burn
 * tokens. V2 swap path: hand the same shape to an Anthropic SDK call
 * with a small system prompt that returns a Suggestion. The DecisionCard
 * already renders `null` as "no suggestion," so adding async won't break
 * anything.
 */
export function suggestForPermission(
  session: Session,
  _mission: Mission | undefined,
  tool: string,
  args: Record<string, unknown>,
): Suggestion | null {
  const command = stringArg(args, 'command');
  const filePath = stringArg(args, 'file_path');
  const url = stringArg(args, 'url');

  // Tool-specific rules — most specific first.
  if (tool === 'Bash' && command) {
    if (/\brm\s+-rf\b/i.test(command) || /\bsudo\b/i.test(command)) {
      return {
        severity: 'danger',
        text: 'Destructive command. Deny unless you have already confirmed the diff.',
      };
    }
    if (/--no-verify\b/.test(command)) {
      return {
        severity: 'warn',
        text: 'Skipping pre-commit hooks. Investigate the failure first.',
      };
    }
    if (/git\s+push.*--force\b/.test(command)) {
      return {
        severity: 'danger',
        text: 'Force-push. Confirm no one else has pushed since.',
      };
    }
    if (
      /git\s+push/.test(command) &&
      /\b(main|master|prod|production)\b/.test(command)
    ) {
      return {
        severity: 'warn',
        text: 'Pushing to main/prod. Confirm the diff first.',
      };
    }
    if (/git\s+reset\s+--hard\b/.test(command)) {
      return {
        severity: 'warn',
        text: 'Hard reset will discard uncommitted changes. Stash first if unsure.',
      };
    }
  }

  if ((tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') && filePath) {
    if (/\.env(\b|\.|\/)|credentials\.json|\.pem$|\.key$/i.test(filePath)) {
      return {
        severity: 'danger',
        text: 'Editing a secrets file. Make sure the agent really needs to.',
      };
    }
    if (/(^|\/)\.git\//.test(filePath)) {
      return {
        severity: 'warn',
        text: 'Editing inside .git/. Almost certainly a mistake.',
      };
    }
  }

  if (tool === 'WebFetch' && url) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(url)) {
      return null;
    }
    if (/^http:\/\//.test(url)) {
      return {
        severity: 'info',
        text: 'Plain HTTP fetch. OK for known internal hosts.',
      };
    }
  }

  // Cross-tool rules — context exhaustion drowns nuance.
  if (session.contextUsagePct >= 90) {
    return {
      severity: 'warn',
      text: `Context at ${session.contextUsagePct.toFixed(0)}%. Run /compact before continuing.`,
    };
  }

  return null;
}

/**
 * Standing suggestions for a session that aren't tied to a specific
 * pending permission. Shown in the SidePanel header when relevant.
 */
export function suggestForSession(
  session: Session,
  mission: Mission | undefined,
): Suggestion | null {
  if (session.status === 'error') {
    return {
      severity: 'danger',
      text: 'Session is in error state. Check the chat tab and consider restarting.',
    };
  }
  if (session.contextUsagePct >= 90) {
    return {
      severity: 'warn',
      text: `Context at ${session.contextUsagePct.toFixed(0)}%. Compact the conversation before the next prompt.`,
    };
  }
  if (session.contextUsagePct >= 80) {
    return {
      severity: 'info',
      text: `Context at ${session.contextUsagePct.toFixed(0)}%. Watch out — output quality drops past 90.`,
    };
  }
  if (
    mission &&
    mission.status === 'active' &&
    mission.metrics.toolCallCount === 0 &&
    Date.now() - mission.startedAt > 5 * 60 * 1000
  ) {
    return {
      severity: 'info',
      text: 'Active mission with no tool calls in 5+ minutes. Agent may be stuck.',
    };
  }
  return null;
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' ? v : null;
}
