import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSolixStore, selectPlanets } from '../store/index.js';
import { Sun } from './Sun.js';
import { Starfield } from './Starfield.js';
import { Planet, PlanetOrbitRing } from './Planet.js';
import { CometLayer } from './Comets.js';

export function Scene(): JSX.Element {
  const planets = useSolixStore(selectPlanets);
  const selectSession = useSolixStore((s) => s.selectSession);

  const orbitSlots = Array.from(
    new Set(planets.map((p) => p.orbitSlot)),
  ).sort((a, b) => a - b);

  return (
    <Canvas
      shadows={false}
      camera={{ position: [0, 14, 22], fov: 55, near: 0.1, far: 600 }}
      onPointerMissed={() => selectSession(null)}
    >
      <color attach="background" args={['#05060c']} />
      <fog attach="fog" args={['#05060c', 30, 220]} />
      <ambientLight intensity={0.15} />
      <Starfield />
      <Sun />
      {orbitSlots.map((slot) => (
        <PlanetOrbitRing key={slot} orbitSlot={slot} />
      ))}
      {planets.map((p) => (
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
