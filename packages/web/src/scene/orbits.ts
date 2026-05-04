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

export function planetPhase(orbitSlot: number, sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return ((h % 360) / 360) * Math.PI * 2 + orbitSlot * 0.4;
}
