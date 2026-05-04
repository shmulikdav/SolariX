import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

export function Sun(): JSX.Element {
  const ref = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.05;
    if (haloRef.current) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 1.3) * 0.04;
      haloRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={2.4} distance={120} color="#fde68a" />
      <mesh ref={ref}>
        <sphereGeometry args={[1.7, 48, 48]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[2.1, 32, 32]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.18} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.7, 32, 32]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.06} />
      </mesh>
    </group>
  );
}
