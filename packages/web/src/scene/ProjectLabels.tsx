import { useContext, useMemo } from 'react';
import { Html } from '@react-three/drei';
import {
  selectAdvisorPlanets,
  selectPlanets,
  useSolixStore,
} from '../store/index.js';
import { hashAngle } from './orbits.js';
import { LayoutContext } from './layout.js';

/**
 * Floating project name labels at each project's orbital cluster.
 *
 * Anchors each label at the project's base angle (a stable hash of
 * projectId) on the outermost ring any of its planets occupy. With the
 * compressed layout, this is usually one of rings 1–5 unless every
 * session in the project is attention-grabbing (active / awaiting),
 * in which case the label hugs the inner ring.
 */
export function ProjectLabels(): JSX.Element {
  const projects = useSolixStore((s) => s.projects);
  const planets = useSolixStore(selectPlanets);
  const advisorPlanets = useSolixStore(selectAdvisorPlanets);
  const layout = useContext(LayoutContext);

  const groups = useMemo(() => {
    const all = [...planets, ...advisorPlanets];
    const map = new Map<
      string,
      { project: (typeof projects)[string]; sessions: typeof all }
    >();
    for (const s of all) {
      const project = projects[s.projectId];
      if (!project) continue;
      const existing = map.get(project.id);
      if (existing) existing.sessions.push(s);
      else map.set(project.id, { project, sessions: [s] });
    }
    return [...map.values()];
  }, [planets, advisorPlanets, projects]);

  if (groups.length < 2) return <></>;

  return (
    <>
      {groups.map(({ project, sessions }) => {
        // Outermost ring used by this project — gives the label headroom
        // outside the planet wedge.
        let outerRadius = 0;
        for (const s of sessions) {
          const entry = layout.get(s.id);
          if (entry && entry.radius > outerRadius) outerRadius = entry.radius;
        }
        if (outerRadius === 0) return null;
        const angle = hashAngle(project.id);
        const radius = outerRadius + 1.2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <Html
            key={project.id}
            position={[x, 1.6, z]}
            center
            distanceFactor={14}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div className="px-2 py-1 rounded text-[9px] uppercase tracking-widest border border-solix-accent/30 bg-black/50 text-solix-accent/80 whitespace-nowrap">
              {project.name}
              <span className="ml-1.5 text-slate-500">
                · {sessions.length}
              </span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
