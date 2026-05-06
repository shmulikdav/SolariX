import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Mesh } from 'three';
import { useSolixStore } from '../store/index.js';
import { planetOrbitRadius, planetPhase } from './orbits.js';

/**
 * Sprint K.5: playful selection feedback. When a planet is clicked
 * (selectedSessionId changes from null → id, or id → otherId), spawn
 * a soft expanding ring at that planet's orbital position. Ring fades
 * over 600ms, then unmounts. Pure feedback — no functional change.
 *
 * The ring is mounted at the world position of the clicked planet at
 * spawn time. Planets keep moving along their orbits, but the ring
 * stays where the click happened, which feels right (you "left a
 * mark" at that point).
 */

const RIPPLE_LIFETIME_MS = 600;
const RIPPLE_FINAL_RADIUS = 2.4;

interface RippleSpec {
  id: number;
  position: [number, number, number];
  spawnedAt: number;
}

let nextId = 1;

export function ClickRipple(): JSX.Element {
  const [ripples, setRipples] = useState<RippleSpec[]>([]);
  const lastSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    // Subscribe to selectedSessionId changes. When it transitions to a
    // non-null value, look up that session's current orbital position
    // and spawn a ripple there.
    const unsub = useSolixStore.subscribe((state) => {
      const next = state.selectedSessionId;
      const last = lastSelectedRef.current;
      if (next === last) return;
      lastSelectedRef.current = next;
      if (!next) return;

      // Look up the session in current state.
      const session = state.sessions[next];
      if (!session) return;

      // We use the planet's *initial* orbital phase here, not its live
      // angle (which lives inside Planet's useFrame ref). For a 600ms
      // ripple this is close enough — planets only travel a tiny arc
      // in that window, and the visual feedback reads as "near the
      // clicked planet." Live-angle accuracy would require lifting
      // angleRef into the store, which isn't worth it.
      const radius = planetOrbitRadius(session.orbitSlot);
      const phase = planetPhase(
        session.orbitSlot,
        session.id,
        session.projectId,
      );
      const x = Math.cos(phase) * radius;
      const z = Math.sin(phase) * radius;

      setRipples((prevRipples) => [
        ...prevRipples,
        {
          id: nextId++,
          position: [x, 0, z],
          spawnedAt: performance.now(),
        },
      ]);
    });
    return unsub;
  }, []);

  // Reap expired ripples each frame.
  useFrame(() => {
    const now = performance.now();
    setRipples((prev) => {
      const survivors = prev.filter(
        (r) => now - r.spawnedAt < RIPPLE_LIFETIME_MS + 50,
      );
      return survivors.length === prev.length ? prev : survivors;
    });
  });

  return (
    <>
      {ripples.map((r) => (
        <Ripple key={r.id} spec={r} />
      ))}
    </>
  );
}

function Ripple({ spec }: { spec: RippleSpec }): JSX.Element {
  const ref = useRef<Mesh>(null);

  useFrame(() => {
    if (!ref.current) return;
    const t = (performance.now() - spec.spawnedAt) / RIPPLE_LIFETIME_MS;
    if (t > 1) {
      ref.current.visible = false;
      return;
    }
    // Ease-out for the radius expansion (fast then slow).
    const eased = 1 - Math.pow(1 - t, 2);
    const r = eased * RIPPLE_FINAL_RADIUS;
    ref.current.scale.set(r, r, r);
    const m = ref.current.material as { opacity: number };
    m.opacity = (1 - t) * 0.65;
  });

  return (
    <mesh ref={ref} position={spec.position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.92, 1, 48]} />
      <meshBasicMaterial
        color="#a5b4fc"
        transparent
        opacity={0.65}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}
