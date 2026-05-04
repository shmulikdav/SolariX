import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, MathUtils, Mesh, MeshStandardMaterial } from 'three';
import type { Session } from '@solix/shared';
import { modelColor, statusEmissive } from './colors.js';
import { moonOrbitRadius } from './orbits.js';

interface MoonProps {
  session: Session;
  index: number;
  speed: number;
}

export function Moon({ session, index, speed }: MoonProps): JSX.Element {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const radius = useMemo(() => moonOrbitRadius(index), [index]);
  const phase = useMemo(() => index * 1.4, [index]);
  const baseColor = useMemo(
    () => new Color(modelColor(session.model)).multiplyScalar(0.7),
    [session.model],
  );

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const angle = phase + t * speed;
    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 0.6) * 0.2,
        Math.sin(angle) * radius,
      );
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.6;
    }
    if (materialRef.current) {
      const target = statusEmissive(session.status);
      materialRef.current.emissive.lerp(new Color(target.color), 0.08);
      materialRef.current.emissiveIntensity = MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        target.intensity * 0.7,
        0.06,
      );
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.2}
          roughness={0.7}
        />
      </mesh>
    </group>
  );
}
