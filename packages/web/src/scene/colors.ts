import type { Model, SessionStatus } from '@solix/shared';

export function modelColor(model: Model): string {
  switch (model) {
    case 'opus':
      return '#a855f7';
    case 'sonnet':
      return '#3b82f6';
    case 'haiku':
      return '#06b6d4';
    case 'default':
      return '#94a3b8';
    default:
      return '#94a3b8';
  }
}

export function statusEmissive(status: SessionStatus): {
  color: string;
  intensity: number;
} {
  // Sprint K.5: capped intensities so the planet body doesn't bloom
  // into a glowing ball under the v1.3.0 lighting (bloom intensity 1.5,
  // threshold 0.42). The atmosphere rim + pulse animations carry the
  // visual signal — the sphere itself stays a sphere.
  switch (status) {
    case 'active':
      return { color: '#fde68a', intensity: 0.30 };
    case 'awaiting_permission':
      // Slightly above bloom threshold so the red still flares through.
      return { color: '#ef4444', intensity: 0.50 };
    case 'awaiting_input':
      return { color: '#f59e0b', intensity: 0.25 };
    case 'plan_review':
      return { color: '#a78bfa', intensity: 0.20 };
    case 'error':
      return { color: '#dc2626', intensity: 0.30 };
    case 'spawning':
      return { color: '#ffffff', intensity: 0.20 };
    case 'idle':
    default:
      return { color: '#1e293b', intensity: 0.05 };
  }
}

/**
 * Sprint M — color for the budget ring as spend approaches the cap.
 * Accent below 75%, amber 75–100%, red at/over the cap.
 */
export function costColor(pct: number): string {
  if (pct >= 100) return '#dc2626';
  if (pct >= 75) return '#f59e0b';
  return '#38bdf8';
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'awaiting_permission':
      return 'Permission';
    case 'awaiting_input':
      return 'Awaiting input';
    case 'plan_review':
      return 'Plan review';
    case 'error':
      return 'Error';
    case 'spawning':
      return 'Spawning';
    case 'terminated':
      return 'Terminated';
    case 'idle':
    default:
      return 'Idle';
  }
}
