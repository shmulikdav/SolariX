import { Canvas } from '@react-three/fiber';
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
      {/*
        Procedural deep-space starfield. drei's <Stars> renders a
        layered field with depth + parallax + a subtle twinkle. No
        asset fetch; no offline failure mode; full control over
        density and saturation. Replaces the earlier HDRI sky which
        ended up showing the GROUND of an outdoor night-photo HDR
        instead of an actual deep-space view.
      */}
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
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={6}
        maxDistance={140}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
