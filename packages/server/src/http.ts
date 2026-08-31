import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/**
 * Agent View shipped in Claude Code v2.1.139. Parse the version string
 * (e.g. "2.1.139" or "2.1.139 (Claude Code)") and compare numerically.
 * Returns false if the version can't be parsed.
 */
function isAgentViewVersion(version: string | undefined): boolean {
  if (!version) return false;
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  // Agent View shipped in Claude Code 2.1.139.
  if (major > 2) return true;
  if (major < 2) return false;
  if (minor > 1) return true;
  if (minor < 1) return false;
  return patch >= 139;
}
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HookEvent } from '@solix/shared';
import type { DB } from './db.js';
import type { EventRouter } from './router.js';
import { listProjects } from './state/projects.js';
import {
  getSession,
  listSessionsForProject,
  setSessionStatus,
} from './state/sessions.js';
import { listMissions } from './state/missions.js';
import { loadTimeline } from './state/timeline.js';
import { listAudit } from './state/audit.js';
import type { AuditKind } from '@solix/shared';
import {
  getAdvisor,
  listAdvisors,
  readAdvisorAgentMd,
} from './state/advisors.js';
import {
  cleanupOrphanedSockets,
  listWrappers,
  registerWrapper,
  unregisterWrapper,
} from './state/wrappers.js';
import { clearSessionWrapper } from './state/sessions.js';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  setScheduleEnabled,
} from './state/schedules.js';
import { createGoal, deleteGoal, listGoals } from './state/goals.js';
import { buildContextEnvelope } from './state/context.js';
import {
  getSkill,
  listSkills,
  readSkillManifest,
  recordSkillInstall,
} from './state/skills.js';
import {
  exportManifest,
  getVersion,
  importManifest,
  listImportHistory,
  listVersions,
  snapshotExport,
} from './state/galaxy.js';
import { diffManifests } from '@solix/shared';
import { RegistryClient } from './cloud.js';
import type { GalaxyManifest } from '@solix/shared';

export function createHttpApp(opts: {
  db: DB;
  router: EventRouter;
  token?: string | null;
  /** Product version to report from /api/health. The CLI injects its own
   * package version; absent when the server is embedded directly. */
  version?: string;
}) {
  const app = new Hono();
  // The UI is served same-origin from this same port, so it never needs CORS.
  // Restrict cross-origin to the known localhost dev origins (Vite proxy on
  // :4243) to close the localhost-CSRF vector that an open `cors()` left open.
  app.use(
    '*',
    cors({
      origin: [
        'http://127.0.0.1:4242',
        'http://localhost:4242',
        'http://127.0.0.1:4243',
        'http://localhost:4243',
      ],
    }),
  );

  // When a token is configured (written by `solix install`), require it on the
  // event-ingestion surface — the only endpoints an arbitrary local process
  // could otherwise spoof. The browser never calls these (it uses the WS), so
  // this doesn't touch the UI. No token configured → no enforcement.
  if (opts.token) {
    const expected = opts.token;
    const paths = ['/events', '/events/permission'];
    for (const p of paths) {
      app.use(p, async (c, next) => {
        if (c.req.header('x-solix-token') !== expected) {
          return c.json({ error: 'unauthorized' }, 401);
        }
        await next();
      });
    }
  }

  const registry = new RegistryClient();

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      service: 'solix',
      version: opts.version ?? 'unknown',
      ts: Date.now(),
    }),
  );

  app.post('/events', async (c) => {
    let body: HookEvent | null = null;
    try {
      body = (await c.req.json()) as HookEvent;
    } catch (err) {
      console.warn('[events] bad JSON', err);
      return c.json({ ok: true });
    }
    if (body && body.event) {
      opts.router.handleHookEvent(body);
    }
    return c.json({ ok: true });
  });

  // Blocking human-in-the-loop gate. A PreToolUse hook (when SOLIX_GATE_ENABLED)
  // POSTs here and holds the connection until a human answers in the browser
  // (or the server-side timeout fires). We answer { decision } so the hook can
  // return Claude Code a real allow/deny. `timeout` lets the hook apply its own
  // fail-open / fail-closed policy.
  app.post('/events/permission', async (c) => {
    let body: HookEvent | null = null;
    try {
      body = (await c.req.json()) as HookEvent;
    } catch {
      return c.json({ decision: 'allow' });
    }
    if (!body || !body.event) return c.json({ decision: 'allow' });
    const result = await opts.router.requestPermission(body);
    const decision = result.timedOut
      ? 'timeout'
      : result.approved
        ? 'allow'
        : 'deny';
    return c.json({ decision });
  });

  app.get('/api/projects', (c) => c.json(listProjects(opts.db)));

  app.get('/api/projects/:id/sessions', (c) => {
    const id = c.req.param('id');
    return c.json(listSessionsForProject(opts.db, id));
  });

  app.get('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const s = getSession(opts.db, id);
    if (!s) return c.json({ error: 'not found' }, 404);
    return c.json(s);
  });

  app.post('/api/sessions/:id/permission', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      requestId?: string;
      approved?: boolean;
    };
    if (!body.requestId)
      return c.json({ error: 'requestId required' }, 400);
    const ok = opts.router.resolvePermission(
      body.requestId,
      Boolean(body.approved),
    );
    return c.json({ ok });
  });

  app.post('/api/sessions/:id/terminate', (c) => {
    const id = c.req.param('id');
    const s = setSessionStatus(opts.db, id, 'terminated');
    return c.json({ ok: Boolean(s) });
  });

  app.post('/api/sessions/:id/context', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as {
      pct?: number;
    };
    if (typeof body.pct !== 'number') {
      return c.json({ error: 'pct (number) required' }, 400);
    }
    opts.router.setContextUsage(id, body.pct);
    return c.json({ ok: true });
  });

  app.get('/api/missions', (c) => {
    const sessionId = c.req.query('sessionId');
    const projectId = c.req.query('projectId');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return c.json(
      listMissions(opts.db, {
        sessionId,
        projectId,
        limit,
      }),
    );
  });

  app.get('/api/timeline', (c) => {
    const sinceMsStr = c.req.query('sinceMs');
    const untilMsStr = c.req.query('untilMs');
    const limitStr = c.req.query('limit');
    const sinceMs = sinceMsStr
      ? parseInt(sinceMsStr, 10)
      : Date.now() - 30 * 60 * 1000;
    const untilMs = untilMsStr ? parseInt(untilMsStr, 10) : Date.now();
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return c.json(loadTimeline(opts.db, { sinceMs, untilMs, limit }));
  });

  app.get('/api/audit', (c) => {
    const sessionId = c.req.query('sessionId') ?? undefined;
    const kindStr = c.req.query('kind');
    const sinceStr = c.req.query('since');
    const untilStr = c.req.query('until');
    const limitStr = c.req.query('limit');
    return c.json(
      listAudit(opts.db, {
        sessionId,
        kind: kindStr ? (kindStr as AuditKind) : undefined,
        since: sinceStr ? parseInt(sinceStr, 10) : undefined,
        until: untilStr ? parseInt(untilStr, 10) : undefined,
        limit: limitStr ? parseInt(limitStr, 10) : undefined,
      }),
    );
  });

  app.get('/api/advisors', (c) => c.json(listAdvisors(opts.db)));

  app.get('/api/advisors/:id', (c) => {
    const a = getAdvisor(opts.db, c.req.param('id'));
    if (!a) return c.json({ error: 'not found' }, 404);
    return c.json({ ...a, agentMd: readAdvisorAgentMd(a) });
  });

  app.post('/api/advisors/:id/enable', (c) => {
    const a = opts.router.setAdvisorEnabled(c.req.param('id'), true);
    return c.json({ ok: Boolean(a), advisor: a });
  });

  app.post('/api/advisors/:id/disable', (c) => {
    const a = opts.router.setAdvisorEnabled(c.req.param('id'), false);
    return c.json({ ok: Boolean(a), advisor: a });
  });

  app.post('/api/advisors/:id/pin', (c) => {
    const ok = opts.router.pinAdvisor(c.req.param('id'));
    return c.json({ ok });
  });

  app.post('/api/advisors/:id/unpin', (c) => {
    const ok = opts.router.unpinAdvisor(c.req.param('id'));
    return c.json({ ok });
  });

  app.get('/api/advisors/:id/preview', (c) => {
    const id = c.req.param('id');
    const targetSessionId = c.req.query('targetSessionId') ?? undefined;
    const prompt = c.req.query('prompt') ?? undefined;
    const env = buildContextEnvelope(opts.db, {
      advisorId: id,
      targetSessionId,
      userPrompt: prompt,
    });
    if (!env) return c.json({ error: 'advisor not found' }, 404);
    return c.json({
      advisorId: env.advisorId,
      role: env.advisorRole,
      prompt: env.prompt,
      recentMissionsCount: env.recentMissions.length,
      targetSessionId: env.targetSession?.id ?? null,
      contextUsagePct: env.targetSession?.contextUsagePct ?? null,
    });
  });

  app.post('/api/advisors/:id/invoke', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      targetSessionId?: string;
      prompt?: string;
    };
    const result = opts.router.invokeAdvisor(
      c.req.param('id'),
      body.targetSessionId,
      body.prompt,
    );
    return c.json(result);
  });

  app.get('/api/skills', (c) => c.json(listSkills(opts.db)));

  app.get('/api/skills/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const s = getSkill(opts.db, id);
    if (!s) return c.json({ error: 'not found' }, 404);
    return c.json({ ...s, manifest: readSkillManifest(s) });
  });

  app.post('/api/skills/:id/install', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
    };
    if (!body.projectId)
      return c.json({ error: 'projectId required' }, 400);
    const s = recordSkillInstall(opts.db, id, body.projectId);
    return c.json({ ok: Boolean(s), skill: s });
  });

  app.get('/api/galaxy/export', (c) => {
    const name = c.req.query('name') ?? undefined;
    const author = c.req.query('author') ?? undefined;
    const description = c.req.query('description') ?? undefined;
    const preview = c.req.query('preview') === '1';
    const manifest = exportManifest(opts.db, {
      name,
      author,
      description,
    });
    // Snapshot every real export into version history (no-op if identical
    // to the previous version — see snapshotExport). Preview reads (used
    // by the import-confirm diff) skip snapshotting so the timeline stays
    // clean.
    if (!preview) snapshotExport(opts.db, manifest);
    return c.json(manifest);
  });

  app.get('/api/galaxy/versions', (c) => {
    const limitStr = c.req.query('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return c.json(listVersions(opts.db, limit));
  });

  app.get('/api/galaxy/versions/:id', (c) => {
    const v = getVersion(opts.db, c.req.param('id'));
    if (!v) return c.json({ error: 'not found' }, 404);
    return c.json(v);
  });

  app.get('/api/galaxy/diff', (c) => {
    const fromId = c.req.query('from');
    const toId = c.req.query('to');
    if (!fromId || !toId) {
      return c.json({ error: 'from and to query params required' }, 400);
    }
    const from = getVersion(opts.db, fromId);
    const to = getVersion(opts.db, toId);
    if (!from || !to) return c.json({ error: 'version not found' }, 404);
    return c.json({
      from: { id: from.id, ordinal: from.ordinal, ts: from.ts },
      to: { id: to.id, ordinal: to.ordinal, ts: to.ts },
      diff: diffManifests(from.manifest, to.manifest),
    });
  });

  app.post('/api/galaxy/import', async (c) => {
    let body: GalaxyManifest | { url?: string };
    try {
      body = (await c.req.json()) as GalaxyManifest | { url?: string };
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }

    let manifest: GalaxyManifest;
    let sourceUrl: string | undefined;
    if ('url' in body && typeof body.url === 'string') {
      sourceUrl = body.url;
      try {
        const res = await fetch(body.url, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return c.json(
            { error: `fetch failed: HTTP ${res.status}` },
            502,
          );
        }
        manifest = (await res.json()) as GalaxyManifest;
      } catch (err) {
        return c.json({ error: `fetch failed: ${String(err)}` }, 502);
      }
    } else {
      manifest = body as GalaxyManifest;
    }

    if (typeof manifest.version !== 'number') {
      return c.json({ error: 'manifest missing version' }, 400);
    }

    try {
      const result = importManifest(opts.db, manifest, sourceUrl);
      opts.router.broadcastGalaxyImported(manifest);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  app.get('/api/galaxy/imports', (c) => c.json(listImportHistory(opts.db)));

  // ──── solix run wrappers (Sprint J) ────────────────────────
  // Wrappers POST here when they spawn a wrapped claude session. The
  // SessionStart hook later claims the registration by cwd to mark
  // the session as bidirectional in the SidePanel composer.
  app.post('/api/wrappers/register', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { wrapperId?: string; socketPath?: string; cwd?: string }
      | null;
    if (!body?.wrapperId || !body.socketPath || !body.cwd) {
      return c.json({ error: 'wrapperId, socketPath, cwd required' }, 400);
    }
    registerWrapper({
      wrapperId: body.wrapperId,
      socketPath: body.socketPath,
      cwd: body.cwd,
      registeredAt: Date.now(),
    });
    return c.json({ ok: true });
  });

  app.post('/api/wrappers/:id/unregister', (c) => {
    const sessionId = unregisterWrapper(c.req.param('id'));
    if (sessionId) {
      const cleared = clearSessionWrapper(opts.db, sessionId);
      if (cleared) {
        opts.router.broadcastSessionUpsert(cleared);
      }
    }
    return c.json({ ok: true });
  });

  app.get('/api/wrappers', (c) => c.json(listWrappers()));

  // ──── Sprint M: heartbeats (scheduled tasks) ────────────────────
  app.get('/api/schedules', (c) => c.json(listSchedules(opts.db)));

  app.post('/api/schedules', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      cwd?: string;
      prompt?: string;
      cadence?: string;
      name?: string;
    };
    if (!body.cwd || !body.prompt || !body.cadence) {
      return c.json({ error: 'cwd, prompt, cadence required' }, 400);
    }
    const schedule = createSchedule(opts.db, {
      cwd: body.cwd,
      prompt: body.prompt,
      cadence: body.cadence,
      name: body.name,
    });
    opts.router.broadcastScheduleUpsert(schedule);
    return c.json(schedule);
  });

  app.post('/api/schedules/:id/toggle', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
    const s = setScheduleEnabled(opts.db, c.req.param('id'), Boolean(body.enabled));
    if (!s) return c.json({ error: 'not found' }, 404);
    opts.router.broadcastScheduleUpsert(s);
    return c.json(s);
  });

  app.delete('/api/schedules/:id', (c) => {
    const id = c.req.param('id');
    const ok = deleteSchedule(opts.db, id);
    if (ok) opts.router.broadcastScheduleRemove(id);
    return c.json({ ok });
  });

  // ──── Sprint M: goals (constellations) ──────────────────────
  app.get('/api/goals', (c) => c.json(listGoals(opts.db)));

  app.post('/api/goals', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      color?: string;
    };
    if (!body.name) return c.json({ error: 'name required' }, 400);
    const goal = createGoal(opts.db, {
      name: body.name,
      description: body.description,
      color: body.color,
    });
    opts.router.broadcastGoalUpsert(goal);
    return c.json(goal);
  });

  app.delete('/api/goals/:id', (c) => {
    const id = c.req.param('id');
    const ok = deleteGoal(opts.db, id);
    if (ok) opts.router.broadcastGoalRemove(id);
    return c.json({ ok });
  });

  // Preflight check used by the NewTaskModal to warn before the user
  // clicks Launch. Cached for the process lifetime — installing claude
  // requires a server restart anyway.
  let preflightCache: {
    claudeAvailable: boolean;
    version?: string;
    agentViewAvailable: boolean;
  } | null = null;
  app.get('/api/system/preflight', (c) => {
    if (preflightCache) return c.json(preflightCache);
    try {
      const res = spawnSync('claude', ['--version'], {
        timeout: 2000,
        encoding: 'utf8',
      });
      if (res.status === 0) {
        const version = (res.stdout ?? '').trim() || undefined;
        preflightCache = {
          claudeAvailable: true,
          version,
          agentViewAvailable: isAgentViewVersion(version),
        };
      } else {
        preflightCache = { claudeAvailable: false, agentViewAvailable: false };
      }
    } catch {
      preflightCache = { claudeAvailable: false, agentViewAvailable: false };
    }
    return c.json(preflightCache);
  });

  // Serve the built web bundle as static when present so `solix start` is one
  // process that gives you the API + WS + UI on a single URL.
  const webDist = findWebDist();
  if (webDist) {
    app.get('*', (c) => {
      const url = new URL(c.req.url);
      // Skip API routes — they're handled above; this is the SPA catch-all.
      if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/events') ||
        url.pathname.startsWith('/ws')
      ) {
        return c.notFound();
      }

      const safe = url.pathname.replace(/\.\.+/g, '.');
      const candidate = join(webDist, safe === '/' ? 'index.html' : safe);
      let filePath = candidate;
      try {
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          filePath = join(webDist, 'index.html');
        }
      } catch {
        filePath = join(webDist, 'index.html');
      }
      if (!existsSync(filePath)) return c.notFound();
      const data = readFileSync(filePath);
      return new Response(data, {
        headers: { 'Content-Type': mimeFor(filePath) },
      });
    });
  }

  app.get('/api/galaxy/registry/status', (c) =>
    c.json({
      configured: registry.isConfigured(),
      url: process.env.SOLIX_REGISTRY_URL ?? null,
    }),
  );

  app.get('/api/galaxy/registry', async (c) => {
    const slugs = await registry.listSlugs();
    return c.json({ slugs });
  });

  app.get('/api/galaxy/registry/:slug', async (c) => {
    const slug = c.req.param('slug');
    try {
      const manifest = await registry.pull(slug);
      return c.json(manifest);
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  app.post('/api/galaxy/registry/:slug/install', async (c) => {
    const slug = c.req.param('slug');
    try {
      const manifest = await registry.pull(slug);
      const result = importManifest(opts.db, manifest, `registry:${slug}`);
      opts.router.broadcastGalaxyImported(manifest);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  // (helpers defined at module bottom)

  app.post('/api/galaxy/publish', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      author?: string;
      description?: string;
    };
    if (!body.slug) {
      return c.json({ error: 'slug required' }, 400);
    }
    const manifest = exportManifest(opts.db, {
      name: body.name,
      author: body.author,
      description: body.description,
    });
    try {
      const published = await registry.publish(body.slug, manifest);
      return c.json({ ok: true, ...published });
    } catch (err) {
      return c.json({ error: String(err) }, 502);
    }
  });

  return app;
}

function findWebDist(): string | null {
  if (process.env.SOLIX_WEB_DIST) {
    return existsSync(process.env.SOLIX_WEB_DIST)
      ? process.env.SOLIX_WEB_DIST
      : null;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Bundled npm package: web/ ships next to the bundled JS file.
    resolve(here, 'web'),
    // Monorepo: server's compiled output is at packages/server/dist.
    resolve(here, '..', '..', 'web', 'dist'),
    resolve(here, '..', '..', '..', 'web', 'dist'),
    resolve(here, '..', '..', '..', 'packages', 'web', 'dist'),
    resolve(process.cwd(), 'packages', 'web', 'dist'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c;
  }
  return null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function mimeFor(filePath: string): string {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
