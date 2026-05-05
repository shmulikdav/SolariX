import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshBasicMaterial, MathUtils } from 'three';
import { useSolixStore } from '../store/index.js';
import { planetOrbitRadius, planetPhase } from './orbits.js';

const COMET_LIFETIME_MS = 1800;

function toolColor(tool: string): string {
  switch (tool) {
    case 'Bash':
      return '#94a3b8';
    case 'Read':
      return '#60a5fa';
    case 'Write':
      return '#34d399';
    case 'Edit':
    case 'MultiEdit':
      return '#fbbf24';
    case 'Task':
      return '#a78bfa';
    default:
      return '#cbd5e1';
  }
}

interface CometProps {
  toolCallId: string;
  startX: number;
  startZ: number;
  color: string;
  receivedAt: number;
}

function Comet({
  toolCallId: _id,
  startX,
  startZ,
  color,
  receivedAt,
}: CometProps): JSX.Element | null {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);

  const dir = useMemo(() => {
    const len = Math.hypot(startX, startZ) || 1;
    const nx = startX / len;
    const nz = startZ / len;
    return { nx, nz };
  }, [startX, startZ]);

  useFrame(() => {
    const elapsed = Date.now() - receivedAt;
    const t = Math.min(1, elapsed / COMET_LIFETIME_MS);
    if (groupRef.current) {
      const dist = MathUtils.lerp(0, 12, t);
      groupRef.current.position.set(
        startX + dir.nx * dist,
        Math.sin(t * Math.PI) * 1.4,
        startZ + dir.nz * dist,
      );
    }
    if (meshRef.current) {
      const m = meshRef.current.material as MeshBasicMaterial;
      m.opacity = 1 - t;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export function CometLayer(): JSX.Element {
  const toolCalls = useSolixStore((s) =>
    s.playback.active ? s.playback.derivedToolCalls : s.recentToolCalls,
  );
  const sessions = useSolixStore((s) =>
    s.playback.active ? s.playback.derivedSessions : s.sessions,
  );

  return (
    <group>
      {toolCalls.map((tc) => {
        const session = sessions[tc.sessionId];
        if (!session) return null;
        const radius = planetOrbitRadius(session.orbitSlot);
        const phase = planetPhase(
          session.orbitSlot,
          session.id,
          session.projectId,
        );
        const t = (Date.now() - tc.startedAt) / 1000;
        const speed = 0.18;
        const angle = phase + t * speed * 0.3;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <Comet
            key={tc.id}
            toolCallId={tc.id}
            startX={x}
            startZ={z}
            color={toolColor(tc.tool)}
            receivedAt={tc.receivedAt}
          />
        );
      })}
    </group>
  );
}
