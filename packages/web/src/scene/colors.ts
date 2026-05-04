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
  switch (status) {
    case 'active':
      return { color: '#fde68a', intensity: 0.9 };
    case 'awaiting_permission':
      return { color: '#ef4444', intensity: 1.0 };
    case 'awaiting_input':
      return { color: '#f59e0b', intensity: 0.7 };
    case 'plan_review':
      return { color: '#a78bfa', intensity: 0.5 };
    case 'error':
      return { color: '#dc2626', intensity: 0.6 };
    case 'spawning':
      return { color: '#ffffff', intensity: 0.4 };
    case 'idle':
    default:
      return { color: '#1e293b', intensity: 0.1 };
  }
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
