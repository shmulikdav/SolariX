import { Suspense, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { type Mesh, RepeatWrapping, TextureLoader } from 'three';
import { useSolixStore } from '../store/index.js';

const SUN_TEXTURE_URL = '/textures/sun.jpg';

export function Sun(): JSX.Element {
  return (
    <group>
      <pointLight
        position={[0, 0, 0]}
        intensity={2.4}
        distance={120}
        color="#fde68a"
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
 * Two stacked translucent shells around the sun — the outer one breathes
 * in/out subtly. With bloom on, this reads as a corona.
 */
function SunHaloes(): JSX.Element {
  const haloRef = useRef<Mesh>(null);

  useFrame(() => {
    if (haloRef.current) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 1.3) * 0.04;
      haloRef.current.scale.set(s, s, s);
    }
  });

  return (
    <>
      <mesh ref={haloRef}>
        <sphereGeometry args={[2.1, 32, 32]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.18}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.7, 32, 32]} />
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
