import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  type Mesh,
  Vector3,
} from 'three';
import { useSolixStore } from '../store/index.js';

/**
 * Atmospheric shooting stars (Sprint K.5). Distinct from the tool-call
 * comets in `Comets.tsx` — these are pure visual delight, untethered
 * from any session activity. A new one spawns every 12–24 seconds,
 * arcs across a chord of the deep background, fades, and unmounts.
 *
 * Implementation: a small pool (max 3 simultaneous) of
 * `ShootingStarLine` components. Each picks two random points on a
 * sphere of radius 180 and animates a leading point + 1.5s trail
 * along the chord.
 */

const POOL_SIZE = 3;
const MIN_INTERVAL_MS = 12_000;
const MAX_INTERVAL_MS = 24_000;
const STAR_LIFETIME_MS = 1500;

interface StarSpec {
  id: number;
  start: Vector3;
  end: Vector3;
  spawnedAt: number;
}

let nextId = 1;

function randomPointOnSphere(radius: number): Vector3 {
  const u = Math.random();
  const v = Math.random();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  );
}

export function ShootingStars(): JSX.Element {
  const [stars, setStars] = useState<StarSpec[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = (): void => {
      if (cancelled) return;
      const wait =
        MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      timer = setTimeout(() => {
        if (cancelled) return;
        if (!useSolixStore.getState().motionEnabled) {
          scheduleNext();
          return;
        }
        const start = randomPointOnSphere(180);
        // Pick an end-point a chord away (not antipodal — too long an arc).
        const endDir = randomPointOnSphere(1)
          .multiplyScalar(60)
          .add(start)
          .normalize()
          .multiplyScalar(180);
        setStars((prev) => {
          const next = [
            ...prev,
            { id: nextId++, start, end: endDir, spawnedAt: performance.now() },
          ];
          // Cap pool size — drop oldest.
          return next.length > POOL_SIZE
            ? next.slice(next.length - POOL_SIZE)
            : next;
        });
        scheduleNext();
      }, wait);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Reap expired stars on every frame so the array stays bounded.
  useFrame(() => {
    const now = performance.now();
    setStars((prev) => {
      const survivors = prev.filter(
        (s) => now - s.spawnedAt < STAR_LIFETIME_MS + 200,
      );
      return survivors.length === prev.length ? prev : survivors;
    });
  });

  return (
    <>
      {stars.map((s) => (
        <ShootingStar key={s.id} spec={s} />
      ))}
    </>
  );
}

function ShootingStar({ spec }: { spec: StarSpec }): JSX.Element {
  const headRef = useRef<Mesh>(null);
  const tailRef = useRef<Mesh>(null);

  useFrame(() => {
    const t = (performance.now() - spec.spawnedAt) / STAR_LIFETIME_MS;
    if (t > 1) return;
    const eased = t * t * (3 - 2 * t); // smoothstep
    const pos = new Vector3().lerpVectors(spec.start, spec.end, eased);
    if (headRef.current) {
      headRef.current.position.copy(pos);
      const m = headRef.current.material as { opacity: number };
      m.opacity = (1 - t) * 1.0;
    }
    if (tailRef.current) {
      const tailEased = Math.max(0, t - 0.08);
      const tailPos = new Vector3().lerpVectors(spec.start, spec.end, tailEased);
      tailRef.current.position.copy(tailPos);
      tailRef.current.lookAt(pos);
      const m = tailRef.current.material as { opacity: number };
      m.opacity = (1 - t) * 0.5;
    }
  });

  return (
    <>
      <mesh ref={headRef} position={spec.start}>
        <sphereGeometry args={[1.4, 8, 8]} />
        <meshBasicMaterial
          color="#fff5cf"
          transparent
          opacity={0}
          toneMapped={false}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={tailRef} position={spec.start}>
        <coneGeometry args={[0.8, 14, 6, 1, true]} />
        <meshBasicMaterial
          color="#fff5cf"
          transparent
          opacity={0}
          toneMapped={false}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
