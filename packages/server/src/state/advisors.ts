import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Advisor, Model } from '@solix/shared';
import type { DB } from '../db.js';
import { now } from '../util.js';

interface ManifestAdvisor {
  id: string;
  role: string;
  codename: string;
  name: string;
  description: string;
  glyph: string;
  color: string;
  defaultModel: Model;
  agentMd: string;
  enabledByDefault: boolean;
  requiredSkills: string[];
  texturePack?: string;
}

interface Manifest {
  version: 1;
  advisors: ManifestAdvisor[];
}

interface AdvisorRow {
  id: string;
  role: string;
  codename: string;
  name: string;
  description: string;
  glyph: string | null;
  color: string | null;
  default_model: string | null;
  agent_md_path: string;
  required_skills_json: string;
  enabled: number;
  pinned: number;
  pinned_session_id: string | null;
  texture_pack: string | null;
  updated_at: number;
}

function findAgentsDir(): string {
  // Locate packages/agents/manifest.json from the running server module.
  // packages/server/src/state/advisors.ts → ../../../agents
  // (search a few candidates so this works in dev and any future bundle.)
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '..', '..', '..', 'agents'),
    resolve(here, '..', '..', 'agents'),
    resolve(here, '..', 'agents'),
    resolve(process.cwd(), 'packages', 'agents'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'manifest.json'))) return c;
  }
  return candidates[0]!;
}

const AGENTS_DIR = findAgentsDir();

function readManifest(): Manifest {
  const path = join(AGENTS_DIR, 'manifest.json');
  if (!existsSync(path)) {
    return { version: 1, advisors: [] };
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function rowToAdvisor(row: AdvisorRow): Advisor {
  let requiredSkills: string[] = [];
  try {
    requiredSkills = JSON.parse(row.required_skills_json) as string[];
  } catch {
    requiredSkills = [];
  }
  return {
    id: row.id,
    role: row.role,
    codename: row.codename,
    name: row.name,
    description: row.description,
    glyph: row.glyph ?? '',
    color: row.color ?? '#94a3b8',
    defaultModel: (row.default_model ?? 'default') as Model,
    agentMdPath: row.agent_md_path,
    enabled: row.enabled === 1,
    pinned: row.pinned === 1,
    pinnedSessionId: row.pinned_session_id ?? undefined,
    requiredSkills,
    texturePack: row.texture_pack ?? undefined,
  };
}

export function seedAdvisors(db: DB): Advisor[] {
  const manifest = readManifest();
  const ts = now();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO advisors
       (id, role, codename, name, description, glyph, color, default_model,
        agent_md_path, required_skills_json, enabled, pinned, texture_pack, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  // Always refresh static metadata (description, glyph, color, model,
  // texture_pack) without touching the user-mutable enabled/pinned state.
  const refresh = db.prepare(
    `UPDATE advisors
     SET role = ?, codename = ?, name = ?, description = ?, glyph = ?,
         color = ?, default_model = ?, agent_md_path = ?,
         required_skills_json = ?, texture_pack = ?, updated_at = ?
     WHERE id = ?`,
  );
  for (const a of manifest.advisors) {
    const md = join(AGENTS_DIR, a.agentMd);
    insert.run(
      a.id,
      a.role,
      a.codename,
      a.name,
      a.description,
      a.glyph,
      a.color,
      a.defaultModel,
      md,
      JSON.stringify(a.requiredSkills),
      a.enabledByDefault ? 1 : 0,
      a.texturePack ?? null,
      ts,
    );
    refresh.run(
      a.role,
      a.codename,
      a.name,
      a.description,
      a.glyph,
      a.color,
      a.defaultModel,
      md,
      JSON.stringify(a.requiredSkills),
      a.texturePack ?? null,
      ts,
      a.id,
    );
  }
  return listAdvisors(db);
}

export function listAdvisors(db: DB): Advisor[] {
  const rows = db
    .prepare(
      'SELECT * FROM advisors ORDER BY enabled DESC, pinned DESC, codename ASC',
    )
    .all() as AdvisorRow[];
  return rows.map(rowToAdvisor);
}

export function getAdvisor(db: DB, id: string): Advisor | null {
  const row = db
    .prepare('SELECT * FROM advisors WHERE id = ?')
    .get(id) as AdvisorRow | undefined;
  return row ? rowToAdvisor(row) : null;
}

export function setAdvisorEnabled(
  db: DB,
  id: string,
  enabled: boolean,
): Advisor | null {
  const ts = now();
  db.prepare(
    'UPDATE advisors SET enabled = ?, updated_at = ? WHERE id = ?',
  ).run(enabled ? 1 : 0, ts, id);
  return getAdvisor(db, id);
}

export function setAdvisorPinned(
  db: DB,
  id: string,
  pinned: boolean,
  sessionId?: string,
): Advisor | null {
  const ts = now();
  db.prepare(
    'UPDATE advisors SET pinned = ?, pinned_session_id = ?, updated_at = ? WHERE id = ?',
  ).run(pinned ? 1 : 0, sessionId ?? null, ts, id);
  return getAdvisor(db, id);
}

export function readAdvisorAgentMd(advisor: Advisor): string {
  if (!existsSync(advisor.agentMdPath)) {
    return '';
  }
  return readFileSync(advisor.agentMdPath, 'utf8');
}

export function getAgentsDir(): string {
  return AGENTS_DIR;
}
