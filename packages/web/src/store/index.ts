import { create } from 'zustand';
import type {
  ClientMessage,
  Mission,
  Project,
  ServerMessage,
  Session,
  ToolCall,
} from '@solix/shared';

export interface PendingPermission {
  requestId: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  receivedAt: number;
}

export interface RecentToolCall extends ToolCall {
  receivedAt: number;
}

interface SolixState {
  connected: boolean;
  projects: Record<string, Project>;
  sessions: Record<string, Session>;
  missions: Record<string, Mission>;
  recentToolCalls: RecentToolCall[];
  pendingPermissions: Record<string, PendingPermission>;
  selectedSessionId: string | null;
  toasts: { id: string; level: 'info' | 'warn' | 'error'; message: string }[];

  setConnected: (c: boolean) => void;
  applyMessage: (msg: ServerMessage) => void;
  selectSession: (id: string | null) => void;
  dismissToast: (id: string) => void;
  resolvePermission: (requestId: string, approved: boolean) => void;

  send: (msg: ClientMessage) => void;
  attachSocket: (send: (msg: ClientMessage) => void) => void;
}

const TOOL_CALL_TTL_MS = 2000;

export const useSolixStore = create<SolixState>((set, get) => ({
  connected: false,
  projects: {},
  sessions: {},
  missions: {},
  recentToolCalls: [],
  pendingPermissions: {},
  selectedSessionId: null,
  toasts: [],

  setConnected: (connected) => set({ connected }),

  applyMessage: (msg) => {
    switch (msg.type) {
      case 'snapshot': {
        const projects: Record<string, Project> = {};
        for (const p of msg.projects) projects[p.id] = p;
        const sessions: Record<string, Session> = {};
        for (const s of msg.sessions) sessions[s.id] = s;
        const missions: Record<string, Mission> = {};
        for (const m of msg.missions) missions[m.id] = m;
        set({ projects, sessions, missions });
        break;
      }
      case 'session_upsert': {
        set((s) => ({
          sessions: { ...s.sessions, [msg.session.id]: msg.session },
        }));
        break;
      }
      case 'session_remove': {
        set((s) => {
          const next = { ...s.sessions };
          delete next[msg.sessionId];
          return { sessions: next };
        });
        break;
      }
      case 'mission_upsert': {
        set((s) => ({
          missions: { ...s.missions, [msg.mission.id]: msg.mission },
        }));
        break;
      }
      case 'tool_call': {
        const enriched: RecentToolCall = {
          ...msg.toolCall,
          receivedAt: Date.now(),
        };
        set((s) => ({
          recentToolCalls: [...s.recentToolCalls, enriched].slice(-200),
        }));
        // GC old comets
        setTimeout(() => {
          set((s) => ({
            recentToolCalls: s.recentToolCalls.filter(
              (t) => Date.now() - t.receivedAt < TOOL_CALL_TTL_MS,
            ),
          }));
        }, TOOL_CALL_TTL_MS + 50);
        break;
      }
      case 'permission_request': {
        const p: PendingPermission = {
          requestId: msg.requestId,
          sessionId: msg.sessionId,
          tool: msg.tool,
          args: msg.args,
          receivedAt: Date.now(),
        };
        set((s) => ({
          pendingPermissions: {
            ...s.pendingPermissions,
            [msg.requestId]: p,
          },
        }));
        break;
      }
      case 'context_update': {
        set((s) => {
          const session = s.sessions[msg.sessionId];
          if (!session) return s;
          return {
            sessions: {
              ...s.sessions,
              [msg.sessionId]: {
                ...session,
                contextUsagePct: msg.usagePct,
              },
            },
          };
        });
        break;
      }
      case 'toast': {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((s) => ({
          toasts: [
            ...s.toasts,
            { id, level: msg.level, message: msg.message },
          ].slice(-6),
        }));
        setTimeout(() => get().dismissToast(id), 5000);
        break;
      }
      default:
        break;
    }
  },

  selectSession: (id) => set({ selectedSessionId: id }),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  resolvePermission: (requestId, approved) => {
    const send = get().send;
    send({ type: 'permission_response', requestId, approved });
    set((s) => {
      const next = { ...s.pendingPermissions };
      delete next[requestId];
      return { pendingPermissions: next };
    });
  },

  send: () => {
    /* replaced when socket attaches */
  },
  attachSocket: (send) => set({ send }),
}));

export function selectPlanets(state: SolixState): Session[] {
  return Object.values(state.sessions).filter((s) => !s.parentSessionId);
}

export function selectMoons(state: SolixState, planetId: string): Session[] {
  return Object.values(state.sessions).filter(
    (s) => s.parentSessionId === planetId,
  );
}
