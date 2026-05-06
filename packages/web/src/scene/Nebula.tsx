import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  type Group,
  type Sprite,
} from 'three';
import { useSolixStore } from '../store/index.js';

/**
 * Stylized-cinematic nebula backdrop (Sprint K.5). 3 large additive
 * sprites at deep distance, each with a procedurally-painted radial
 * gradient. They drift slowly on independent axes so the void feels
 * lived-in instead of flat-black.
 *
 * Sits inside the Milky Way skybox (radius 400) but outside the
 * fog's start range, so the skybox stars stay visible behind the
 * nebula color and the nebula color softens with distance.
 */

interface NebulaSprite {
  position: [number, number, number];
  size: number;
  hue: number;          // 0..1 around the color wheel
  saturation: number;
  rotationSpeed: number;
  driftAxis: [number, number, number];
}

const SPRITES: NebulaSprite[] = [
  // Sprint K.5b: more sprites, more saturation, bigger presence. The
  // sun got toned down, so the nebula carries the visual color now.
  {
    // Magenta cloud upper-left
    position: [-160, 70, -110],
    size: 240,
    hue: 0.92,
    saturation: 0.75,
    rotationSpeed: 0.008,
    driftAxis: [0, 1, 0],
  },
  {
    // Deep violet on the lower-right
    position: [150, -50, -130],
    size: 280,
    hue: 0.74,
    saturation: 0.78,
    rotationSpeed: -0.006,
    driftAxis: [1, 0, 0],
  },
  {
    // Cyan/teal far behind the sun, large and soft
    position: [-30, -20, -260],
    size: 360,
    hue: 0.5,
    saturation: 0.7,
    rotationSpeed: 0.004,
    driftAxis: [0, 1, 1],
  },
  {
    // Hot pink streak above
    position: [60, 130, -180],
    size: 200,
    hue: 0.95,
    saturation: 0.85,
    rotationSpeed: 0.011,
    driftAxis: [1, 0.4, 0],
  },
  {
    // Cool blue galaxy in deep upper-right distance
    position: [200, 80, -240],
    size: 290,
    hue: 0.62,
    saturation: 0.7,
    rotationSpeed: -0.005,
    driftAxis: [0.5, 1, 0],
  },
  {
    // Warm amber filament low-left for color balance
    position: [-130, -90, -200],
    size: 220,
    hue: 0.08,
    saturation: 0.55,
    rotationSpeed: 0.007,
    driftAxis: [0, 0, 1],
  },
];

/** Paint a soft radial gradient onto a 256x256 canvas in the requested hue. */
function makeNebulaTexture(hue: number, saturation: number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new CanvasTexture(canvas);
  }

  // Convert hue (0..1) to RGB once for the inner stop.
  const h = hue * 360;
  const inner = `hsla(${h}, ${Math.round(saturation * 100)}%, 60%, 0.85)`;
  const mid = `hsla(${h}, ${Math.round(saturation * 100)}%, 45%, 0.35)`;
  const outer = `hsla(${h}, ${Math.round(saturation * 100)}%, 25%, 0)`;

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.45, mid);
  gradient.addColorStop(1, outer);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Add a subtle organic noise pass on top so the cloud edges aren't
  // perfectly circular.
  ctx.globalCompositeOperation = 'destination-in';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 70;
    const a = 0.4 + Math.random() * 0.6;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, `rgba(255,255,255,${a})`);
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function Nebula(): JSX.Element {
  const groupRef = useRef<Group>(null);
  const spriteRefs = useRef<(Sprite | null)[]>([]);

  const textures = useMemo(
    () =>
      SPRITES.map((s) =>
        typeof document === 'undefined'
          ? null
          : makeNebulaTexture(s.hue, s.saturation),
      ),
    [],
  );

  useFrame((_, delta) => {
    if (!useSolixStore.getState().motionEnabled) return;
    spriteRefs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const spec = SPRITES[i]!;
      sprite.material.rotation += delta * spec.rotationSpeed;
      // Tiny drift along the spec's axis. Bounded so sprites don't
      // wander out of frame.
      const t = performance.now() * 0.0001;
      sprite.position.x = spec.position[0] + Math.sin(t * (i + 1)) * 6;
      sprite.position.y = spec.position[1] + Math.cos(t * (i + 1)) * 4;
    });
  });

  return (
    <group ref={groupRef}>
      {SPRITES.map((spec, i) => {
        const tex = textures[i];
        if (!tex) return null;
        return (
          <sprite
            key={i}
            ref={(s) => {
              spriteRefs.current[i] = s;
            }}
            position={spec.position}
            scale={[spec.size, spec.size, 1]}
          >
            <spriteMaterial
              map={tex}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              opacity={0.55}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </group>
  );
}
