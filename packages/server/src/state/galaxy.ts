import { nanoid } from 'nanoid';
import type {
  GalaxyManifest,
  GalaxyManifestAdvisor,
  GalaxyManifestProject,
  GalaxyManifestSkill,
  GalaxyVersion,
} from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';
import { listAdvisors, setAdvisorEnabled } from './advisors.js';
import { listSkills } from './skills.js';
import { listProjects } from './projects.js';

export interface ExportOptions {
  name?: string;
  author?: string;
  description?: string;
}

export function exportManifest(
  db: DB,
  opts: ExportOptions = {},
): GalaxyManifest {
  const advisors = listAdvisors(db);
  const skills = listSkills(db);
  const projects = listProjects(db);

  const manifestAdvisors: GalaxyManifestAdvisor[] = advisors
    .filter((a) => a.enabled)
    .map((a) => ({
      role: a.id,
      pinned: a.pinned,
      model: a.defaultModel,
    }))
    .sort((a, b) => a.role.localeCompare(b.role));

  const manifestSkills: GalaxyManifestSkill[] = skills
    .map((s) => ({ id: s.id, source: s.source }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const manifestProjects: GalaxyManifestProject[] = projects
    .map((p) => ({ name: p.name, cwd: p.cwd }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    name: opts.name ?? 'My Galaxy',
    author: opts.author,
    description: opts.description,
    advisors: manifestAdvisors,
    skills: manifestSkills,
    projects: manifestProjects,
  };
}

export interface ImportResult {
  advisorsEnabled: number;
  advisorsDisabled: number;
  projectsHinted: number;
}

/**
 * Apply a manifest to the local DB.
 *
 * Privileged actions intentionally NOT performed:
 * - Pinning (always-on processes spawn) — user must explicitly opt in after import
 * - Skill installation (changes filesystem) — user must explicitly install
 * - Scheduled task creation — same reasoning
 * - Project creation at arbitrary cwd — only hint via the projects array
 */
export function importManifest(
  db: DB,
  manifest: GalaxyManifest,
  sourceUrl?: string,
): ImportResult {
  if (manifest.version !== 1) {
    throw new Error(`Unsupported galaxy manifest version: ${manifest.version}`);
  }

  const enabledRoles = new Set(manifest.advisors.map((a) => a.role));
  const allAdvisors = listAdvisors(db);

  let enabled = 0;
  let disabled = 0;
  for (const a of allAdvisors) {
    const shouldEnable = enabledRoles.has(a.id);
    if (shouldEnable && !a.enabled) {
      setAdvisorEnabled(db, a.id, true);
      enabled++;
    } else if (!shouldEnable && a.enabled) {
      // Disable advisors not present in the manifest, BUT only the opt-in ones.
      // Never auto-disable a default-enabled advisor (compass/forge/lumen/argus/sentinel).
      const isCore = ['compass', 'forge', 'lumen', 'argus', 'sentinel'].includes(
        a.id,
      );
      if (!isCore) {
        setAdvisorEnabled(db, a.id, false);
        disabled++;
      }
    }
  }

  db.prepare(
    `INSERT INTO galaxy_imports (id, source_url, manifest_json, imported_at)
     VALUES (?, ?, ?, ?)`,
  ).run(nanoid(), sourceUrl ?? null, JSON.stringify(manifest), now());

  return {
    advisorsEnabled: enabled,
    advisorsDisabled: disabled,
    projectsHinted: manifest.projects.length,
  };
}

export function listImportHistory(
  db: DB,
): { id: string; sourceUrl?: string; importedAt: number; manifestName: string }[] {
  const rows = db
    .prepare(
      'SELECT id, source_url, manifest_json, imported_at FROM galaxy_imports ORDER BY imported_at DESC LIMIT 20',
    )
    .all() as {
    id: string;
    source_url: string | null;
    manifest_json: string;
    imported_at: number;
  }[];
  return rows.map((r) => {
    let name = '(unknown)';
    try {
      const m = JSON.parse(r.manifest_json) as GalaxyManifest;
      name = m.name;
    } catch {
      /* ignore */
    }
    return {
      id: r.id,
      sourceUrl: r.source_url ?? undefined,
      importedAt: r.imported_at,
      manifestName: name,
    };
  });
}

// ──── Versioning ───────────────────────────────────────────────────────

interface GalaxyVersionRow {
  id: string;
  ts: number;
  ordinal: number;
  name: string;
  author: string | null;
  description: string | null;
  manifest_json: string;
}

function rowToVersion(row: GalaxyVersionRow): GalaxyVersion {
  let manifest: GalaxyManifest;
  try {
    manifest = JSON.parse(row.manifest_json) as GalaxyManifest;
  } catch {
    // Should never happen — table only stores manifests we just produced.
    manifest = {
      version: 1,
      name: row.name,
      advisors: [],
      skills: [],
      projects: [],
    };
  }
  return {
    id: row.id,
    ts: row.ts,
    ordinal: row.ordinal,
    name: row.name,
    author: row.author ?? undefined,
    description: row.description ?? undefined,
    manifest,
  };
}

/**
 * Snapshot a manifest into the version history. Skips persistence if
 * the most recent version is byte-identical (avoids cluttering the
 * timeline when the user re-exports without changes).
 */
export function snapshotExport(
  db: DB,
  manifest: GalaxyManifest,
): GalaxyVersion {
  const last = db
    .prepare(
      'SELECT manifest_json, ordinal FROM galaxy_versions ORDER BY ordinal DESC LIMIT 1',
    )
    .get() as { manifest_json: string; ordinal: number } | undefined;

  if (last) {
    const lastJson = last.manifest_json;
    const newJson = JSON.stringify(manifest);
    if (lastJson === newJson) {
      const existing = db
        .prepare('SELECT * FROM galaxy_versions WHERE ordinal = ? LIMIT 1')
        .get(last.ordinal) as GalaxyVersionRow;
      return rowToVersion(existing);
    }
  }

  const id = nanoid();
  const ts = now();
  const ordinal = (last?.ordinal ?? 0) + 1;
  db.prepare(
    `INSERT INTO galaxy_versions (id, ts, ordinal, name, author, description, manifest_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ts,
    ordinal,
    manifest.name,
    manifest.author ?? null,
    manifest.description ?? null,
    JSON.stringify(manifest),
  );

  return {
    id,
    ts,
    ordinal,
    name: manifest.name,
    author: manifest.author,
    description: manifest.description,
    manifest,
  };
}

export function listVersions(db: DB, limit = 50): GalaxyVersion[] {
  const rows = db
    .prepare(
      'SELECT * FROM galaxy_versions ORDER BY ordinal DESC LIMIT ?',
    )
    .all(Math.min(limit, 500)) as GalaxyVersionRow[];
  return rows.map(rowToVersion);
}

export function getVersion(db: DB, id: string): GalaxyVersion | null {
  const row = db
    .prepare('SELECT * FROM galaxy_versions WHERE id = ? LIMIT 1')
    .get(id) as GalaxyVersionRow | undefined;
  return row ? rowToVersion(row) : null;
}
