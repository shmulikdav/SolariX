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

export function createHttpApp(opts: {
  db: DB;
  router: EventRouter;
}) {
  const app = new Hono();
  app.use('*', cors());

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

  return app;
}
