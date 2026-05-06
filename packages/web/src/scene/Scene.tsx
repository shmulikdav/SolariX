import { Suspense, useEffect, useRef, type ComponentRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import {
  selectAdvisorPlanets,
  selectPlanets,
  useSolixStore,
} from '../store/index.js';
import { Sun } from './Sun.js';
import { Starfield } from './Starfield.js';
import { Planet, PlanetOrbitRing } from './Planet.js';
import { CometLayer } from './Comets.js';
import { AdvisorRing } from './AdvisorRing.js';
import { AsteroidBelt } from './AsteroidBelt.js';
import { ProjectLabels } from './ProjectLabels.js';
import { attachControls, detachControls } from './cameraControls.js';
import { BackSide, type Mesh } from 'three';

const MILKY_WAY_URL = '/textures/milky_way.jpg';

export function Scene(): JSX.Element {
  const planets = useSolixStore(selectPlanets);
  const advisorPlanets = useSolixStore(selectAdvisorPlanets);
  const selectSession = useSolixStore((s) => s.selectSession);
  const selectAdvisor = useSolixStore((s) => s.selectAdvisor);
  const selectSkill = useSolixStore((s) => s.selectSkill);

  const allOuter = [...planets, ...advisorPlanets];
  const orbitSlots = Array.from(
    new Set(allOuter.map((p) => p.orbitSlot)),
  ).sort((a, b) => a - b);

  return (
    <Canvas
      shadows={false}
      camera={{ position: [0, 14, 22], fov: 55, near: 0.1, far: 600 }}
      onPointerMissed={() => {
        selectSession(null);
        selectAdvisor(null);
        selectSkill(null);
      }}
    >
      <color attach="background" args={['#05060c']} />
      <fog attach="fog" args={['#080a14', 60, 280]} />
      <ambientLight intensity={0.18} />
      {/*
        Real Milky Way panorama as a giant inside-out sphere skybox.
        Falls back gracefully (Suspense boundary) to the procedural
        <Stars> below if the texture isn't on disk.
      */}
      <Suspense fallback={<Stars radius={180} depth={80} count={6000} factor={4} saturation={0.4} fade speed={0} />}>
        <MilkyWaySkybox />
      </Suspense>
      <Starfield />
      <Sun />
      <AdvisorRing />
      <AsteroidBelt />
      {orbitSlots.map((slot) => (
        <PlanetOrbitRing key={slot} orbitSlot={slot} />
      ))}
      {allOuter.map((p) => (
        <Planet key={p.id} session={p} />
      ))}
      <CometLayer />
      <ProjectLabels />
      <ControlsBridge />
      {/*
        Bloom makes the textured sun, active planet emissives, and red /
        orange flares actually glow. Tuned to favor the brightest sources
        (the sun) without lighting up regular UI text overlays via <Html>.
      */}
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={1.1}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

function MilkyWaySkybox(): JSX.Element {
  const meshRef = useRef<Mesh>(null);
  const texture = useTexture(MILKY_WAY_URL);
  return (
    <mesh ref={meshRef} scale={[-1, 1, 1]}>
      <sphereGeometry args={[400, 48, 32]} />
      <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
    </mesh>
  );
}

function ControlsBridge(): JSX.Element {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();

  useEffect(() => {
    attachControls(
      ref.current as unknown as Parameters<typeof attachControls>[0],
      camera as unknown as Parameters<typeof attachControls>[1],
    );
    return () => detachControls();
  }, [camera]);

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      minDistance={6}
      maxDistance={140}
      target={[0, 0, 0]}
    />
  );
}
