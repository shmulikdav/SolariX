import { Suspense, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  type Mesh,
  RepeatWrapping,
  type Sprite,
  TextureLoader,
} from 'three';
import { useSolixStore } from '../store/index.js';

const SUN_TEXTURE_URL = '/textures/sun.jpg';

// Bumped from 1.7 in Sprint K.5 — visually a bigger central feature.
// All corona/halo radii scale from this.
const SUN_RADIUS = 2.3;

export function Sun(): JSX.Element {
  return (
    <group>
      {/*
        Sprint K lighting overhaul: stronger sun, steeper falloff. Inner
        planets get bright, outer planets fade naturally — ambient is
        nearly zero now so this is the only real lightsource. decay=2 is
        physically correct inverse-square.
      */}
      <pointLight
        position={[0, 0, 0]}
        intensity={28}
        distance={140}
        decay={2}
        color="#ffd486"
      />
      <Suspense fallback={<SunFallback />}>
        <SunBody />
      </Suspense>
      <SunHaloes />
      <SolarProminences />
      <LensFlare />
    </group>
  );
}

/**
 * Textured sun body. Slight axial rotation when motion is on; rotation
 * pauses with the rest of the scene.
 */
function SunBody(): JSX.Element {
  const ref = useRef<Mesh>(null);
  const texture = useLoader(TextureLoader, SUN_TEXTURE_URL);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  useFrame((_, delta) => {
    const motion = useSolixStore.getState().motionEnabled;
    if (motion && ref.current) ref.current.rotation.y += delta * 0.05;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
      {/*
        meshBasicMaterial — sun is its own light source; we don't want the
        scene's pointLight applying shading on top of the texture. The
        texture color goes straight to the screen, then bloom takes care of
        the glow.
      */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Procedural fallback if the texture isn't available. */
function SunFallback(): JSX.Element {
  return (
    <mesh>
      <sphereGeometry args={[SUN_RADIUS, 48, 48]} />
      <meshBasicMaterial color="#fde68a" />
    </mesh>
  );
}

/**
 * Three stacked translucent shells around the sun — the inner one
 * breathes in/out subtly. With bloom + ACES tonemapping on, this
 * reads as a proper corona with hot edge and faint outer haze.
 */
function SunHaloes(): JSX.Element {
  const haloRef = useRef<Mesh>(null);
  const outerRef = useRef<Mesh>(null);

  useFrame(() => {
    const t = performance.now() * 0.001;
    if (haloRef.current) {
      const s = 1 + Math.sin(t * 1.3) * 0.04;
      haloRef.current.scale.set(s, s, s);
    }
    if (outerRef.current) {
      const s = 1 + Math.sin(t * 0.6 + 1) * 0.025;
      outerRef.current.scale.set(s, s, s);
    }
  });

  return (
    <>
      {/* Hot inner shell — closest to the surface, brightest tone */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[SUN_RADIUS * 1.15, 32, 32]} />
        <meshBasicMaterial
          color="#fff7c2"
          transparent
          opacity={0.32}
          toneMapped={false}
        />
      </mesh>
      {/* Mid corona */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.41, 32, 32]} />
        <meshBasicMaterial
          color="#ffae3c"
          transparent
          opacity={0.16}
          toneMapped={false}
        />
      </mesh>
      {/* Outer haze — large, faint, pulsing slow */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[SUN_RADIUS * 1.96, 32, 32]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.06}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

/**
 * Sprint K.5: a handful of flame-shaped sprite billboards attached at
 * random latitudes on the sun's surface. They flicker (sin-driven
 * opacity + scale wobble) so the sun feels alive rather than static.
 */
function makeFlameTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Vertical flame: hot core at bottom, fading to transparent at top.
  const grad = ctx.createLinearGradient(0, size, 0, 0);
  grad.addColorStop(0, 'rgba(255,250,210,1)');
  grad.addColorStop(0.3, 'rgba(255,170,40,0.85)');
  grad.addColorStop(0.7, 'rgba(220,80,20,0.4)');
  grad.addColorStop(1, 'rgba(120,30,0,0)');

  ctx.fillStyle = grad;
  // Pinch the flame: narrower at top, wider at bottom, using triangle path.
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size);
  ctx.quadraticCurveTo(size * 0.5, size * 0.5, size * 0.85, size);
  ctx.lineTo(size * 0.5, 0);
  ctx.closePath();
  ctx.fill();

  return new CanvasTexture(canvas);
}

interface FlameSpec {
  pos: [number, number, number];
  size: number;
  phase: number;
  baseOpacity: number;
}

function SolarProminences(): JSX.Element {
  const flames: FlameSpec[] = useMemo(() => {
    // 8 flames evenly distributed on the surface with random scale + phase.
    return Array.from({ length: 8 }, (_, i) => {
      const theta = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const phi = (Math.random() - 0.5) * 1.0; // mostly equatorial
      const r = SUN_RADIUS * 1.02;
      return {
        pos: [
          r * Math.cos(phi) * Math.cos(theta),
          r * Math.sin(phi),
          r * Math.cos(phi) * Math.sin(theta),
        ],
        size: 0.5 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
        baseOpacity: 0.45 + Math.random() * 0.3,
      };
    });
  }, []);
  const texture = useMemo(() => makeFlameTexture(), []);
  const refs = useRef<(Sprite | null)[]>([]);

  useFrame(() => {
    const t = performance.now() * 0.001;
    refs.current.forEach((sprite, i) => {
      if (!sprite) return;
      const spec = flames[i]!;
      const wobble = 0.85 + Math.sin(t * 1.4 + spec.phase) * 0.25;
      sprite.scale.set(spec.size * wobble, spec.size * wobble * 1.4, 1);
      const m = sprite.material;
      m.opacity = spec.baseOpacity * (0.7 + Math.sin(t * 1.7 + spec.phase) * 0.3);
    });
  });

  if (!texture) return <></>;

  return (
    <>
      {flames.map((spec, i) => (
        <sprite
          key={i}
          ref={(s) => {
            refs.current[i] = s;
          }}
          position={spec.pos}
        >
          <spriteMaterial
            map={texture}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            opacity={spec.baseOpacity}
            toneMapped={false}
          />
        </sprite>
      ))}
    </>
  );
}

/**
 * Sprint K.5: lens-flare billboards centered on the sun. Four additive
 * sprites of varying tint (white core, gold, soft purple, faint blue)
 * sized roughly 0.4 / 0.7 / 0.3 / 0.5 of the sun radius. They bloom
 * with the corona to read as a real-camera flare.
 */
function makeFlareTexture(color: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.4)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

interface FlareSpec {
  size: number;
  color: string;
  opacity: number;
}

const FLARES: FlareSpec[] = [
  { size: SUN_RADIUS * 4.5, color: 'rgba(255,255,235,1)', opacity: 0.55 },
  { size: SUN_RADIUS * 8.0, color: 'rgba(255,200,120,1)', opacity: 0.30 },
  { size: SUN_RADIUS * 3.6, color: 'rgba(220,180,255,1)', opacity: 0.20 },
  { size: SUN_RADIUS * 6.2, color: 'rgba(180,210,255,1)', opacity: 0.18 },
];

function LensFlare(): JSX.Element {
  const textures = useMemo(
    () => FLARES.map((f) => makeFlareTexture(f.color)),
    [],
  );

  return (
    <>
      {FLARES.map((spec, i) => {
        const tex = textures[i];
        if (!tex) return null;
        return (
          <sprite key={i} position={[0, 0, 0]} scale={[spec.size, spec.size, 1]}>
            <spriteMaterial
              map={tex}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              opacity={spec.opacity}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </>
  );
}
