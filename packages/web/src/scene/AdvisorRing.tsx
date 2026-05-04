import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { Advisor } from '@solix/shared';
import {
  selectEnabledAdvisors,
  useSolixStore,
} from '../store/index.js';

const RING_RADIUS = 3.3;
const PLANET_SIZE = 0.28;

interface AdvisorPlanetProps {
  advisor: Advisor;
  index: number;
  total: number;
}

function AdvisorPlanet({
  advisor,
  index,
  total,
}: AdvisorPlanetProps): JSX.Element {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const phase = useMemo(
    () => (index / Math.max(1, total)) * Math.PI * 2,
    [index, total],
  );
  const baseColor = useMemo(() => new Color(advisor.color), [advisor.color]);

  const select = useSolixStore((s) => s.selectAdvisor);
  const isSelected = useSolixStore(
    (s) => s.selectedAdvisorId === advisor.id,
  );

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    // Slow shared rotation around the sun, plus per-advisor offset.
    const angle = phase + t * 0.18;
    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(angle) * RING_RADIUS,
        0,
        Math.sin(angle) * RING_RADIUS,
      );
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.4;
    }
    if (materialRef.current) {
      const target = advisor.pinned ? 0.6 : 0.22;
      materialRef.current.emissiveIntensity = MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        target,
        0.05,
      );
    }
    if (haloRef.current) {
      const pulse = isSelected
        ? 1.0
        : 0.5 + 0.5 * Math.sin(t * 1.1 + index);
      const s = 1.0 + pulse * 0.15;
      haloRef.current.scale.set(s, s, s);
      const mat = haloRef.current.material as MeshStandardMaterial;
      mat.opacity = isSelected ? 0.3 : 0.1 + pulse * 0.06;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    select(advisor.id);
  };

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[PLANET_SIZE, 24, 24]} />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.22}
          roughness={0.55}
          metalness={0.4}
        />
      </mesh>
      <mesh ref={haloRef}>
        <sphereGeometry args={[PLANET_SIZE * 1.15, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          transparent
          opacity={0.12}
          roughness={1}
        />
      </mesh>
      <Html
        center
        distanceFactor={9}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        position={[0, PLANET_SIZE + 0.32, 0]}
      >
        <div
          className={`px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap border ${
            isSelected
              ? 'bg-amber-400/20 border-amber-300 text-amber-100'
              : 'bg-black/60 border-white/10 text-amber-100/80'
          }`}
        >
          <span className="mr-1">{advisor.glyph}</span>
          {advisor.codename}
          {advisor.pinned && (
            <span className="ml-1 text-amber-300">●</span>
          )}
        </div>
      </Html>
    </group>
  );
}

export function AdvisorRing(): JSX.Element | null {
  const enabled = useSolixStore(selectEnabledAdvisors);
  if (!enabled.length) return null;

  return (
    <group>
      {/* Faint orbit ring so the crew zone reads as a deliberate inner band. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[RING_RADIUS - 0.03, RING_RADIUS + 0.03, 128]}
        />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.12}
          side={2}
        />
      </mesh>
      {enabled.map((advisor, i) => (
        <AdvisorPlanet
          key={advisor.id}
          advisor={advisor}
          index={i}
          total={enabled.length}
        />
      ))}
    </group>
  );
}
