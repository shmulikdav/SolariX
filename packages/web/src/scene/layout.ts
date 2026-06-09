import { createContext, useContext } from 'react';
import type { Session, SessionStatus } from '@solix/shared';
import { hashAngle } from './orbits.js';

// Compressed galaxy layout: maps every visible session to a (radius, angle,
// ringIndex) regardless of how many sessions there are. The server still
// assigns a monotonic `orbit_slot` per project, but the client no longer
// renders one ring per slot — instead we cap visible rings at 6 and bucket
// sessions onto them, keeping a project's sessions clustered in the same
// angular wedge.

const MAX_RINGS = 6;
const INNER_RADIUS = 7;
const RING_STEP = 2.4;
// Rings 1..5 hold non-attention sessions, bucketed deterministically by
// projectId so a project's idle sessions land on a single ring.
const PROJECT_BUCKETS = MAX_RINGS - 1;

// Sessions in these states are pulled onto the innermost ring so the
// planets that need a human are always close to the sun.
const ATTENTION_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'active',
  'awaiting_permission',
  'awaiting_input',
  'error',
  'plan_review',
]);

export interface LayoutEntry {
  radius: number;
  angle: number;
  ringIndex: number;
}

export type GalaxyLayout = ReadonlyMap<string, LayoutEntry>;

function ringRadius(ringIndex: number): number {
  return INNER_RADIUS + ringIndex * RING_STEP;
}

// FNV-1a → uniform bucket in [0, n).
function hashBucket(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

export function computeGalaxyLayout(planets: Session[]): GalaxyLayout {
  const out = new Map<string, LayoutEntry>();
  if (planets.length === 0) return out;

  // Step 1: assign every planet to a ring index.
  type Slot = { ringIndex: number; projectId: string; id: string };
  const slotsByRing = new Map<number, Slot[]>();
  for (const p of planets) {
    const ringIndex = ATTENTION_STATUSES.has(p.status)
      ? 0
      : 1 + hashBucket(p.projectId, PROJECT_BUCKETS);
    const slot: Slot = { ringIndex, projectId: p.projectId, id: p.id };
    const arr = slotsByRing.get(ringIndex);
    if (arr) arr.push(slot);
    else slotsByRing.set(ringIndex, [slot]);
  }

  // Step 2: within each ring, group by projectId and distribute each
  // project's planets across an angular wedge centered on the project's
  // stable base angle. Wedge width grows with planet count but caps at
  // (2π / projectsOnRing) * 0.4 so projects never collide on a shared ring.
  for (const [ringIndex, slots] of slotsByRing) {
    const radius = ringRadius(ringIndex);

    const byProj = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = byProj.get(s.projectId);
      if (arr) arr.push(s);
      else byProj.set(s.projectId, [s]);
    }

    const projectCount = byProj.size;
    const maxWedgeHalf = ((2 * Math.PI) / Math.max(1, projectCount)) * 0.4;

    for (const [projectId, projSlots] of byProj) {
      const base = hashAngle(projectId);
      const wedgeHalf = Math.min(
        maxWedgeHalf,
        Math.max(0.3, 0.18 * projSlots.length),
      );
      // Deterministic order so a re-render with the same sessions produces
      // the same per-planet angles.
      projSlots.sort((a, b) => (a.id < b.id ? -1 : 1));
      const n = projSlots.length;
      projSlots.forEach((s, i) => {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        const angle = base + t * 2 * wedgeHalf;
        out.set(s.id, { radius, angle, ringIndex });
      });
    }
  }

  return out;
}

const EMPTY_LAYOUT: GalaxyLayout = new Map();
const FALLBACK: LayoutEntry = {
  radius: INNER_RADIUS,
  angle: 0,
  ringIndex: 0,
};

export const LayoutContext = createContext<GalaxyLayout>(EMPTY_LAYOUT);

export function useLayoutEntry(sessionId: string): LayoutEntry {
  const layout = useContext(LayoutContext);
  return layout.get(sessionId) ?? FALLBACK;
}

export function uniqueRingRadii(layout: GalaxyLayout): number[] {
  const seen = new Set<number>();
  for (const v of layout.values()) seen.add(v.radius);
  return [...seen].sort((a, b) => a - b);
}
