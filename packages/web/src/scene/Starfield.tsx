import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, type Points } from 'three';
import { useSolixStore } from '../store/index.js';

/**
 * Sprint K.5b: stars now have per-vertex color. Most are warm-white,
 * with a sprinkling of warm gold (closer / cooler suns) and cool blue
 * (hot, far away). Drives the eye to "this is a sky with character",
 * not a uniform pixel field.
 */
const COLOR_PALETTE: [number, number, number][] = [
  // Warm white (most common — ~60%)
  [1.0, 0.95, 0.85],
  [0.95, 0.9, 0.85],
  [1.0, 0.97, 0.9],
  [0.92, 0.88, 0.82],
  [1.0, 0.95, 0.85],
  [1.0, 0.95, 0.85],
  // Warm gold/amber (~20%)
  [1.0, 0.78, 0.45],
  [1.0, 0.7, 0.4],
  // Cool blue-white (~20%)
  [0.7, 0.85, 1.0],
  [0.6, 0.8, 1.0],
];

export function Starfield({ count = 1100 }: { count?: number }): JSX.Element {
  const ref = useRef<Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radius = 220;
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = radius * (0.6 + Math.random() * 0.4);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c =
        COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]!;
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
  }, [count]);

  useFrame((_, delta) => {
    if (!useSolixStore.getState().motionEnabled) return;
    if (ref.current) {
      ref.current.rotation.y += delta * 0.005;
      ref.current.rotation.x += delta * 0.002;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        vertexColors
        size={0.5}
        sizeAttenuation
        transparent
        opacity={0.55}
      />
    </points>
  );
}
