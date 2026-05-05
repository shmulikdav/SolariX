import { Suspense, useMemo, useRef } from 'react';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
} from 'three';
import type { Advisor } from '@solix/shared';
import {
  selectEnabledAdvisors,
  useSolixStore,
} from '../store/index.js';
import { AtmosphereRim } from './AtmosphereRim.js';

const RING_RADIUS = 3.3;
const PLANET_SIZE = 0.34; // slightly bigger so textures read at this orbit

interface TexturePackSpec {
  body: string;
  ring?: string;
  cloud?: string;
  ringInner?: number; // multiples of PLANET_SIZE
  ringOuter?: number;
  axialTilt?: number; // radians
}

const TEXTURE_PACKS: Record<string, TexturePackSpec> = {
  saturn: {
    body: '/textures/saturn.jpg',
    ring: '/textures/saturn_ring.png',
    ringInner: 1.5,
    ringOuter: 2.4,
    axialTilt: 0.45,
  },
  mars: {
    body: '/textures/mars.jpg',
    axialTilt: 0.4,
  },
  earth: {
    body: '/textures/earth.jpg',
    cloud: '/textures/earth_clouds.png',
    axialTilt: 0.41,
  },
  jupiter: {
    body: '/textures/jupiter.jpg',
    axialTilt: 0.05,
  },
  moon: {
    body: '/textures/moon.jpg',
    axialTilt: 0.1,
  },
};

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
  const phase = useMemo(
    () => (index / Math.max(1, total)) * Math.PI * 2,
    [index, total],
  );
  const select = useSolixStore((s) => s.selectAdvisor);
  const isSelected = useSolixStore(
    (s) => s.selectedAdvisorId === advisor.id,
  );

  const angleRef = useRef(phase);

  useFrame((_state, delta) => {
    const motionEnabled = useSolixStore.getState().motionEnabled;
    if (motionEnabled) angleRef.current += delta * 0.18;
    const angle = angleRef.current;
    if (groupRef.current) {
      groupRef.current.position.set(
        Math.cos(angle) * RING_RADIUS,
        0,
        Math.sin(angle) * RING_RADIUS,
      );
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    select(advisor.id);
  };

  const pack = advisor.texturePack
    ? TEXTURE_PACKS[advisor.texturePack]
    : undefined;

  return (
    <group ref={groupRef}>
      {pack ? (
        <Suspense fallback={<ProceduralBody advisor={advisor} onClick={onClick} />}>
          <TexturedBody advisor={advisor} pack={pack} onClick={onClick} />
        </Suspense>
      ) : (
        <ProceduralBody advisor={advisor} onClick={onClick} />
      )}

      <AtmosphereRim
        radius={PLANET_SIZE}
        color={advisor.color}
        intensity={advisor.pinned ? 1.4 : 0.7}
        power={3.5}
      />

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

interface TexturedBodyProps {
  advisor: Advisor;
  pack: TexturePackSpec;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function TexturedBody({ advisor, pack, onClick }: TexturedBodyProps): JSX.Element {
  const bodyRef = useRef<Mesh>(null);
  const cloudRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);

  const bodyTex = useLoader(TextureLoader, pack.body);
  const cloudTex = useLoader(
    TextureLoader,
    pack.cloud ?? '/textures/sun.jpg', // any present file; we just gate render below
  );
  const ringTex = useLoader(
    TextureLoader,
    pack.ring ?? '/textures/sun.jpg',
  );

  bodyTex.wrapS = RepeatWrapping;
  bodyTex.wrapT = RepeatWrapping;

  useFrame((_, delta) => {
    const motion = useSolixStore.getState().motionEnabled;
    if (!motion) return;
    if (bodyRef.current) bodyRef.current.rotation.y += delta * 0.18;
    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.25;
    if (ringRef.current) ringRef.current.rotation.z += delta * 0.05;
  });

  const tilt = pack.axialTilt ?? 0;
  const ringInner = (pack.ringInner ?? 1.5) * PLANET_SIZE;
  const ringOuter = (pack.ringOuter ?? 2.4) * PLANET_SIZE;

  return (
    <group rotation={[tilt, 0, 0]}>
      <mesh ref={bodyRef} onClick={onClick}>
        <sphereGeometry args={[PLANET_SIZE, 48, 48]} />
        <meshStandardMaterial
          map={bodyTex}
          roughness={0.85}
          metalness={0.05}
          emissive={new Color(advisor.color)}
          emissiveIntensity={advisor.pinned ? 0.25 : 0.1}
        />
      </mesh>

      {pack.cloud && (
        <mesh ref={cloudRef}>
          <sphereGeometry args={[PLANET_SIZE * 1.02, 48, 48]} />
          <meshStandardMaterial
            map={cloudTex}
            transparent
            opacity={0.55}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      )}

      {pack.ring && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringInner, ringOuter, 96]} />
          <meshStandardMaterial
            map={ringTex}
            transparent
            opacity={0.85}
            side={DoubleSide}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      )}
    </group>
  );
}

interface ProceduralBodyProps {
  advisor: Advisor;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

/** Fallback / opt-out body — solid color sphere with a subtle emissive lerp. */
function ProceduralBody({ advisor, onClick }: ProceduralBodyProps): JSX.Element {
  const meshRef = useRef<Mesh>(null);
  const matRef = useRef<MeshStandardMaterial>(null);
  const baseColor = useMemo(() => new Color(advisor.color), [advisor.color]);

  useFrame((_, delta) => {
    const motion = useSolixStore.getState().motionEnabled;
    if (motion && meshRef.current) meshRef.current.rotation.y += delta * 0.4;
    if (matRef.current) {
      const target = advisor.pinned ? 0.6 : 0.22;
      matRef.current.emissiveIntensity = MathUtils.lerp(
        matRef.current.emissiveIntensity,
        target,
        0.05,
      );
    }
  });

  return (
    <mesh ref={meshRef} onClick={onClick}>
      <sphereGeometry args={[PLANET_SIZE, 24, 24]} />
      <meshStandardMaterial
        ref={matRef}
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={0.22}
        roughness={0.55}
        metalness={0.4}
      />
    </mesh>
  );
}

export function AdvisorRing(): JSX.Element | null {
  const enabled = useSolixStore(selectEnabledAdvisors);
  if (!enabled.length) return null;

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[RING_RADIUS - 0.03, RING_RADIUS + 0.03, 128]}
        />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.12}
          side={DoubleSide}
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
