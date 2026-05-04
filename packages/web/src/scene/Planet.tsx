import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, Group, Mesh, MathUtils, MeshStandardMaterial } from 'three';
import type { Session } from '@solix/shared';
import { useSolixStore, selectMoons } from '../store/index.js';
import { modelColor, statusEmissive, statusLabel } from './colors.js';
import {
  moonOrbitRadius,
  moonOrbitSpeed,
  planetOrbitRadius,
  planetOrbitSpeed,
  planetPhase,
} from './orbits.js';
import { Moon } from './Moon.js';

interface PlanetProps {
  session: Session;
}

export function Planet({ session }: PlanetProps): JSX.Element {
  const groupRef = useRef<Group>(null);
  const planetRef = useRef<Mesh>(null);
  const flareRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const phase = useMemo(
    () => planetPhase(session.orbitSlot, session.id),
    [session.orbitSlot, session.id],
  );
  const radius = useMemo(
    () => planetOrbitRadius(session.orbitSlot),
    [session.orbitSlot],
  );

  const moons = useSolixStore((s) => selectMoons(s, session.id));
  const selectSession = useSolixStore((s) => s.selectSession);
  const selectAdvisor = useSolixStore((s) => s.selectAdvisor);
  const advisorForRole = useSolixStore((s) => {
    if (!session.advisorRole) return null;
    return (
      Object.values(s.advisors).find((a) => a.id === session.advisorRole) ?? null
    );
  });
  const selectedSessionId = useSolixStore((s) => s.selectedSessionId);
  const isSelected = selectedSessionId === session.id;
  const isAdvisor = session.kind === 'advisor';

  const baseColor = useMemo(
    () =>
      new Color(
        isAdvisor && advisorForRole
          ? advisorForRole.color
          : modelColor(session.model),
      ),
    [isAdvisor, advisorForRole, session.model],
  );

  useFrame((state, delta) => {
    const speed = planetOrbitSpeed(session.status === 'active', session.orbitSlot);
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * speed * 0.5;
    }

    const t = state.clock.getElapsedTime();
    const angle = phase + t * speed * 0.3;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const tilt = Math.sin(angle * 0.5) * 0.4;
    if (groupRef.current) {
      groupRef.current.position.set(x, tilt, z);
    }

    if (planetRef.current) {
      planetRef.current.rotation.y += delta * 0.4;
      const targetScale = 0.55 + (session.contextUsagePct / 100) * 0.5;
      const cur = planetRef.current.scale.x;
      const next = MathUtils.lerp(cur, targetScale, 0.04);
      planetRef.current.scale.set(next, next, next);
    }

    if (materialRef.current) {
      const target = statusEmissive(session.status);
      const targetColor = new Color(target.color);
      materialRef.current.emissive.lerp(targetColor, 0.08);
      materialRef.current.emissiveIntensity = MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        target.intensity,
        0.06,
      );
    }

    if (flareRef.current) {
      const ctxCritical = session.contextUsagePct >= 90;
      const ctxWarn = session.contextUsagePct >= 80 && !ctxCritical;
      const showFlare =
        session.status === 'awaiting_permission' ||
        session.status === 'awaiting_input' ||
        ctxCritical ||
        ctxWarn;
      if (showFlare) {
        let freq = 0.8;
        let color = '#f59e0b';
        if (session.status === 'awaiting_permission') {
          freq = 1.5;
          color = '#ef4444';
        } else if (session.status === 'awaiting_input') {
          freq = 0.8;
          color = '#f59e0b';
        } else if (ctxCritical) {
          freq = 1.2;
          color = '#dc2626';
        } else if (ctxWarn) {
          freq = 0.6;
          color = '#fb923c';
        }
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq);
        const mat = flareRef.current.material as MeshStandardMaterial;
        mat.color.set(color);
        mat.opacity = 0.25 + pulse * 0.5;
        flareRef.current.visible = true;
        const s = 1.4 + pulse * 0.5;
        flareRef.current.scale.set(s, s, s);
      } else {
        flareRef.current.visible = false;
      }
    }

    if (ringRef.current) {
      ringRef.current.visible = session.status === 'plan_review';
      ringRef.current.rotation.z += delta * 0.3;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    selectSession(session.id);
    if (isAdvisor && advisorForRole) {
      selectAdvisor(advisorForRole.id);
    }
  };

  const planetSize = 0.55;

  return (
    <group ref={groupRef}>
      <mesh ref={planetRef} onClick={onClick} castShadow>
        <sphereGeometry args={[planetSize, 32, 32]} />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.1}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      <mesh ref={flareRef} visible={false}>
        <sphereGeometry args={[planetSize * 1.4, 24, 24]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.4} />
      </mesh>

      <mesh ref={ringRef} visible={false} rotation={[Math.PI / 2.4, 0, 0]}>
        <ringGeometry args={[planetSize * 1.4, planetSize * 2.0, 64]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.5} side={2} />
      </mesh>

      {isAdvisor && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[planetSize * 1.25, planetSize * 1.35, 64]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.7} side={2} />
        </mesh>
      )}

      {moons.map((moon, i) => (
        <Moon key={moon.id} session={moon} index={i} speed={moonOrbitSpeed()} />
      ))}

      <Html
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        position={[0, planetSize + 0.4, 0]}
      >
        <div
          className={`px-2 py-1 rounded text-[10px] whitespace-nowrap border ${
            isSelected
              ? 'bg-solix-accent/20 border-solix-accent text-white'
              : isAdvisor
                ? 'bg-amber-500/10 border-amber-300/50 text-amber-100'
                : 'bg-black/50 border-white/10 text-slate-200'
          }`}
        >
          <div className="font-semibold flex items-center gap-1">
            {isAdvisor && advisorForRole && (
              <span style={{ color: advisorForRole.color }}>
                {advisorForRole.glyph}
              </span>
            )}
            <span>
              {session.name ??
                (isAdvisor && advisorForRole
                  ? `${advisorForRole.codename} (pinned)`
                  : session.id.slice(0, 8))}
            </span>
          </div>
          <div className="opacity-70">
            {String(session.model)} · {statusLabel(session.status)}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function PlanetOrbitRing({
  orbitSlot,
}: {
  orbitSlot: number;
}): JSX.Element {
  const radius = planetOrbitRadius(orbitSlot);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.02, radius + 0.02, 128]} />
      <meshBasicMaterial color="#1e293b" transparent opacity={0.35} side={2} />
    </mesh>
  );
}
