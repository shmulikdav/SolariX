const PLANET_BASE_RADIUS = 6;
const PLANET_RADIUS_STEP = 2.4;

export function planetOrbitRadius(orbitSlot: number): number {
  return PLANET_BASE_RADIUS + orbitSlot * PLANET_RADIUS_STEP;
}

const MOON_BASE_RADIUS = 1.4;
const MOON_RADIUS_STEP = 0.6;

export function moonOrbitRadius(index: number): number {
  return MOON_BASE_RADIUS + index * MOON_RADIUS_STEP;
}

export function planetOrbitSpeed(active: boolean, orbitSlot: number): number {
  const base = 0.18 - orbitSlot * 0.012;
  const speed = Math.max(0.05, base);
  return active ? speed * 1.6 : speed;
}

export function moonOrbitSpeed(): number {
  return 0.7;
}

/**
 * Per-session orbital phase (radians).
 *
 * Sessions in the same project share a base angle so they cluster as a
 * visual group. Within a project, sessions spread out into a small wedge
 * around that base — gives a "this is project X's neighborhood" effect
 * without sacrificing per-planet identity.
 *
 *   projectId → base angle on the orbital plane (deterministic hash)
 *   sessionId → tiny offset within that project's wedge
 *   orbitSlot → minor radial spread
 */
export function planetPhase(
  orbitSlot: number,
  sessionId: string,
  projectId?: string,
): number {
  const base = projectId ? hashAngle(projectId) : hashAngle(sessionId);
  const offset = ((hashAngle(sessionId) % 0.6) - 0.3) * (projectId ? 1 : 0);
  return base + offset + orbitSlot * 0.05;
}

function hashAngle(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619);
  }
  return ((h % 360) / 360) * Math.PI * 2;
}
