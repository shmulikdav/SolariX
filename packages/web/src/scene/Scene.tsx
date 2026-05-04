import { useEffect, useRef, type ComponentRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
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
import { attachControls, detachControls } from './cameraControls.js';

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
      <ambientLight intensity={0.12} />
      <Stars
        radius={180}
        depth={80}
        count={6000}
        factor={4}
        saturation={0.4}
        fade
        speed={0.6}
      />
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
      <ControlsBridge />
    </Canvas>
  );
}

/**
 * Renders <OrbitControls> and exposes its imperative ref + the camera to the
 * cameraControls module so the on-screen HUD buttons can pan/zoom/reset.
 * Lives inside <Canvas> because that's where useThree() works.
 */
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
