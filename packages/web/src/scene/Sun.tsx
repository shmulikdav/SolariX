import { Suspense, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { type Mesh, RepeatWrapping, TextureLoader } from 'three';
import { useSolixStore } from '../store/index.js';

const SUN_TEXTURE_URL = '/textures/sun.jpg';

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
      <sphereGeometry args={[1.7, 64, 64]} />
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
      <sphereGeometry args={[1.7, 48, 48]} />
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
      // Slower, larger breath on the outer shell — gives the sun the
      // organic "alive" feel we want without distracting motion.
      const s = 1 + Math.sin(t * 0.6 + 1) * 0.025;
      outerRef.current.scale.set(s, s, s);
    }
  });

  return (
    <>
      {/* Hot inner shell — closest to the surface, brightest tone */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[1.95, 32, 32]} />
        <meshBasicMaterial
          color="#fff7c2"
          transparent
          opacity={0.32}
          toneMapped={false}
        />
      </mesh>
      {/* Mid corona */}
      <mesh>
        <sphereGeometry args={[2.4, 32, 32]} />
        <meshBasicMaterial
          color="#ffae3c"
          transparent
          opacity={0.16}
          toneMapped={false}
        />
      </mesh>
      {/* Outer haze — large, faint, pulsing slow */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[3.3, 32, 32]} />
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
