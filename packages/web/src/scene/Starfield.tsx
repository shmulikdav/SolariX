import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, BufferAttribute, type Points } from 'three';

export function Starfield({ count = 4000 }: { count?: number }): JSX.Element {
  const ref = useRef<Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
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
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.005;
      ref.current.rotation.x += delta * 0.002;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color="#cbd5e1"
        size={0.6}
        sizeAttenuation
        transparent
        opacity={0.85}
      />
    </points>
  );
}
