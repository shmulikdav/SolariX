import type { GalaxyManifest, GalaxyManifestDiff } from './types.js';

/**
 * Compute the difference between two galaxy manifests.
 *
 * Pure function — no DB, no network. Used both server-side (e.g. to
 * pre-compute a diff for an /api/galaxy/diff endpoint) and client-side
 * (Versions tab in GalaxyPanel renders the result directly).
 *
 * Symmetry: `diff(a, b)` is what changed *going from a to b*. Items in
 * `added` are present in b but not a; `removed` is the inverse.
 */
export function diffManifests(
  a: GalaxyManifest,
  b: GalaxyManifest,
): GalaxyManifestDiff {
  const advisorsA = new Map(a.advisors.map((x) => [x.role, x]));
  const advisorsB = new Map(b.advisors.map((x) => [x.role, x]));
  const advisorAdded = [...advisorsB.keys()].filter(
    (k) => !advisorsA.has(k),
  );
  const advisorRemoved = [...advisorsA.keys()].filter(
    (k) => !advisorsB.has(k),
  );
  const advisorPinChanged = [...advisorsB.keys()]
    .filter((k) => advisorsA.has(k))
    .map((k) => ({
      role: k,
      from: advisorsA.get(k)!.pinned,
      to: advisorsB.get(k)!.pinned,
    }))
    .filter((c) => c.from !== c.to);

  const skillsA = new Set(a.skills.map((s) => s.id));
  const skillsB = new Set(b.skills.map((s) => s.id));
  const skillAdded = [...skillsB].filter((id) => !skillsA.has(id));
  const skillRemoved = [...skillsA].filter((id) => !skillsB.has(id));

  // Projects don't have stable ids in the manifest — match by name.
  const projectsA = new Set(a.projects.map((p) => p.name));
  const projectsB = new Set(b.projects.map((p) => p.name));
  const projectAdded = [...projectsB].filter((n) => !projectsA.has(n));
  const projectRemoved = [...projectsA].filter((n) => !projectsB.has(n));

  return {
    advisors: {
      added: advisorAdded.sort(),
      removed: advisorRemoved.sort(),
      pinChanged: advisorPinChanged.sort((x, y) =>
        x.role.localeCompare(y.role),
      ),
    },
    skills: {
      added: skillAdded.sort(),
      removed: skillRemoved.sort(),
    },
    projects: {
      added: projectAdded.sort(),
      removed: projectRemoved.sort(),
    },
  };
}

/** True when two manifests are functionally equivalent (no diff). */
export function manifestsEqual(
  a: GalaxyManifest,
  b: GalaxyManifest,
): boolean {
  const d = diffManifests(a, b);
  return (
    d.advisors.added.length === 0 &&
    d.advisors.removed.length === 0 &&
    d.advisors.pinChanged.length === 0 &&
    d.skills.added.length === 0 &&
    d.skills.removed.length === 0 &&
    d.projects.added.length === 0 &&
    d.projects.removed.length === 0
  );
}
