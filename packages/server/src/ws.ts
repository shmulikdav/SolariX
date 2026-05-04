import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@solix/shared';
import type { Broadcaster } from './broadcaster.js';
import type { DB } from './db.js';
import type { EventRouter } from './router.js';
import { listProjects } from './state/projects.js';
import { listActiveSessions } from './state/sessions.js';
import { listMissions } from './state/missions.js';
import { listAdvisors } from './state/advisors.js';
import { listSkills } from './state/skills.js';

export interface WsContext {
  db: DB;
  router: EventRouter;
  broadcaster: Broadcaster;
}

export function attachWs(server: HttpServer, ctx: WsContext): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on(
    'upgrade',
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = req.url ?? '';
      if (!url.startsWith('/ws')) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    },
  );

  wss.on('connection', (ws: WebSocket) => {
    ctx.broadcaster.add(ws);

    const snapshot: ServerMessage = {
      type: 'snapshot',
      projects: listProjects(ctx.db),
      sessions: listActiveSessions(ctx.db),
      missions: listMissions(ctx.db, { limit: 100 }),
      advisors: listAdvisors(ctx.db),
      skills: listSkills(ctx.db),
    };
    ctx.broadcaster.send(ws, snapshot);

    ws.on('message', (raw) => {
      let msg: ClientMessage | null = null;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (!msg) return;
      handleClientMessage(ctx, ws, msg);
    });

    ws.on('close', () => {
      ctx.broadcaster.remove(ws);
    });

    ws.on('error', () => {
      ctx.broadcaster.remove(ws);
    });
  });

  return wss;
}

function handleClientMessage(
  ctx: WsContext,
  _ws: WebSocket,
  msg: ClientMessage,
): void {
  switch (msg.type) {
    case 'permission_response':
      ctx.router.resolvePermission(msg.requestId, msg.approved);
      break;
    case 'terminate_session':
      // M3.5: hand off to launcher; for M0 we just mark terminated.
      break;
    case 'send_prompt':
      ctx.router.sendPromptToSession(msg.sessionId, msg.text);
      break;
    case 'launch_session':
      ctx.router.launchInternalSession({
        cwd: msg.cwd,
        model: msg.model,
        initialPrompt: msg.initialPrompt,
      });
      break;
    case 'invoke_advisor':
      ctx.router.invokeAdvisor(
        msg.advisorId,
        msg.targetSessionId,
        msg.prompt,
      );
      break;
    case 'pin_advisor':
      ctx.router.pinAdvisor(msg.advisorId);
      break;
    case 'unpin_advisor':
      ctx.router.unpinAdvisor(msg.advisorId);
      break;
    default:
      break;
  }
}
