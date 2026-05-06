import type { Mission, Session } from '@solix/shared';

/**
 * Per-session health score 0–100.
 *
 * Pure heuristic — no LLM, no I/O. Composed of four bands:
 *
 *   stability  (30) — current status (idle/active/spawning ok; error 0;
 *                     plan_review/awaiting_input partial)
 *   attention  (30) — penalty for unresolved permissions on this session
 *   budget     (25) — proportional to remaining context (1 - pct/100)
 *   progress   (15) — credit for tool calls in the active mission
 *
 * Returned alongside `reasons[]` so the SidePanel and the List view can
 * surface *why* a planet's score is low. Callers can pick the first
 * reason as a tooltip.
 *
 * V2: replace stability heuristic with a per-mission failure rate and
 * per-session retry counter. Defer.
 */
export function computeHealth(
  session: Session,
  mission: Mission | undefined,
  pendingForSession: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  let stability = 30;
  switch (session.status) {
    case 'error':
      stability = 0;
      reasons.push('In error state');
      break;
    case 'plan_review':
    case 'awaiting_input':
      stability = 15;
      reasons.push(`Status: ${session.status}`);
      break;
    case 'awaiting_permission':
      stability = 12;
      reasons.push('Awaiting permission');
      break;
    case 'terminated':
      stability = 5;
      reasons.push('Terminated');
      break;
    default:
      stability = 30;
  }

  const attention = Math.max(0, 30 - pendingForSession * 15);
  if (pendingForSession > 0) {
    reasons.push(
      `${pendingForSession} pending permission${pendingForSession === 1 ? '' : 's'}`,
    );
  }

  const ctxRatio = Math.max(0, 1 - session.contextUsagePct / 100);
  const budget = 25 * ctxRatio;
  if (session.contextUsagePct >= 90) {
    reasons.push(`Context at ${session.contextUsagePct.toFixed(0)}%`);
  } else if (session.contextUsagePct >= 80) {
    reasons.push(`Context warm (${session.contextUsagePct.toFixed(0)}%)`);
  }

  let progress = 0;
  if (mission && mission.status === 'active') {
    const tools = mission.metrics.toolCallCount;
    // Saturating curve: a few tool calls show motion; many are diminishing.
    progress = Math.min(15, tools * 2);
  } else if (mission && mission.status === 'completed') {
    progress = 15;
  }

  const score = Math.round(
    Math.max(0, Math.min(100, stability + attention + budget + progress)),
  );
  return { score, reasons };
}

export function healthColor(score: number): string {
  if (score >= 75) return '#10b981'; // ok
  if (score >= 50) return '#fbbf24'; // warm
  if (score >= 25) return '#f97316'; // warning
  return '#ef4444'; // danger
}
