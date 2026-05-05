import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import {
  getAdvisor,
  listAdvisors,
  readAdvisorAgentMd,
  setAdvisorEnabled,
} from './state/advisors.js';
import { buildContextEnvelope } from './state/context.js';
import {
  getSkill,
  listSkills,
  readSkillManifest,
  recordSkillInstall,
} from './state/skills.js';
import {
  exportManifest,
  importManifest,
  listImportHistory,
} from './state/galaxy.js';
import { RegistryClient } from './cloud.js';
import type { GalaxyManifest } from '@solix/shared';

export function createHttpApp(opts: {
  db: DB;
  router: EventRouter;
}) {
  const app = new Hono();
  app.use('*', cors());
  const registry = new RegistryClient();

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      service: 'solix',
      version: '1.0.0',
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

  app.get('/api/advisors', (c) => c.json(listAdvisors(opts.db)));

  app.get('/api/advisors/:id', (c) => {
    const a = getAdvisor(opts.db, c.req.param('id'));
    if (!a) return c.json({ error: 'not found' }, 404);
    return c.json({ ...a, agentMd: readAdvisorAgentMd(a) });
  });

  app.post('/api/advisors/:id/enable', (c) => {
    const a = setAdvisorEnabled(opts.db, c.req.param('id'), true);
    return c.json({ ok: Boolean(a), advisor: a });
  });

  app.post('/api/advisors/:id/disable', (c) => {
    const a = setAdvisorEnabled(opts.db, c.req.param('id'), false);
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
    const manifest = exportManifest(opts.db, {
      name,
      author,
      description,
    });
    return c.json(manifest);
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
