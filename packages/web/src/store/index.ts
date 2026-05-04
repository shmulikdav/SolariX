import { create } from 'zustand';
import type {
  Advisor,
  ChatDelta,
  ClientMessage,
  Mission,
  Project,
  ServerMessage,
  Session,
  Skill,
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

export interface ChatEntry extends ChatDelta {
  receivedAt: number;
}

interface SolixState {
  connected: boolean;
  projects: Record<string, Project>;
  sessions: Record<string, Session>;
  missions: Record<string, Mission>;
  advisors: Record<string, Advisor>;
  skills: Record<string, Skill>;
  recentToolCalls: RecentToolCall[];
  pendingPermissions: Record<string, PendingPermission>;
  // Per-session chat log, in arrival order. Capped at 200 entries per session.
  chatBySessionId: Record<string, ChatEntry[]>;
  selectedSessionId: string | null;
  selectedAdvisorId: string | null;
  selectedSkillId: string | null;
  toasts: { id: string; level: 'info' | 'warn' | 'error'; message: string }[];

  setConnected: (c: boolean) => void;
  applyMessage: (msg: ServerMessage) => void;
  selectSession: (id: string | null) => void;
  selectAdvisor: (id: string | null) => void;
  selectSkill: (id: string | null) => void;
  dismissToast: (id: string) => void;
  resolvePermission: (requestId: string, approved: boolean) => void;
  invokeAdvisor: (advisorId: string, prompt?: string) => void;
  pinAdvisor: (advisorId: string) => void;
  unpinAdvisor: (advisorId: string) => void;
  sendPromptTo: (sessionId: string, text: string) => void;
  launchTask: (cwd: string, model: string, initialPrompt?: string) => void;

  send: (msg: ClientMessage) => void;
  attachSocket: (send: (msg: ClientMessage) => void) => void;
}

const TOOL_CALL_TTL_MS = 2000;

export const useSolixStore = create<SolixState>((set, get) => ({
  connected: false,
  projects: {},
  sessions: {},
  missions: {},
  advisors: {},
  skills: {},
  chatBySessionId: {},
  recentToolCalls: [],
  pendingPermissions: {},
  selectedSessionId: null,
  selectedAdvisorId: null,
  selectedSkillId: null,
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
        const advisors: Record<string, Advisor> = {};
        for (const a of msg.advisors) advisors[a.id] = a;
        const skills: Record<string, Skill> = {};
        for (const sk of msg.skills) skills[sk.id] = sk;
        set({ projects, sessions, missions, advisors, skills });
        break;
      }
      case 'advisor_upsert': {
        set((s) => ({
          advisors: { ...s.advisors, [msg.advisor.id]: msg.advisor },
        }));
        break;
      }
      case 'skill_upsert': {
        set((s) => ({
          skills: { ...s.skills, [msg.skill.id]: msg.skill },
        }));
        break;
      }
      case 'galaxy_imported': {
        // Snapshot will follow; no-op for now beyond toast.
        const id = `${Date.now()}-galaxy`;
        set((s) => ({
          toasts: [
            ...s.toasts,
            {
              id,
              level: 'info' as const,
              message: `Imported galaxy: ${msg.manifest.name}`,
            },
          ].slice(-6),
        }));
        setTimeout(() => get().dismissToast(id), 5000);
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
      case 'chat_delta': {
        const entry: ChatEntry = { ...msg.delta, receivedAt: Date.now() };
        set((s) => {
          const existing = s.chatBySessionId[msg.sessionId] ?? [];
          // De-dupe by messageId so retries from the watcher don't double up.
          const deduped = existing.filter(
            (e) => e.messageId !== entry.messageId,
          );
          const next = [...deduped, entry].slice(-200);
          return {
            chatBySessionId: {
              ...s.chatBySessionId,
              [msg.sessionId]: next,
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

  selectSession: (id) =>
    set({
      selectedSessionId: id,
      selectedAdvisorId: id ? null : get().selectedAdvisorId,
      selectedSkillId: id ? null : get().selectedSkillId,
    }),

  selectAdvisor: (id) =>
    set({
      selectedAdvisorId: id,
      selectedSessionId: id ? null : get().selectedSessionId,
      selectedSkillId: id ? null : get().selectedSkillId,
    }),

  selectSkill: (id) =>
    set({
      selectedSkillId: id,
      selectedSessionId: id ? null : get().selectedSessionId,
      selectedAdvisorId: id ? null : get().selectedAdvisorId,
    }),

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

  invokeAdvisor: (advisorId, prompt) => {
    const send = get().send;
    const targetSessionId = get().selectedSessionId ?? undefined;
    send({ type: 'invoke_advisor', advisorId, targetSessionId, prompt });
  },

  pinAdvisor: (advisorId) => {
    get().send({ type: 'pin_advisor', advisorId });
  },

  unpinAdvisor: (advisorId) => {
    get().send({ type: 'unpin_advisor', advisorId });
  },

  sendPromptTo: (sessionId, text) => {
    if (!text.trim()) return;
    get().send({ type: 'send_prompt', sessionId, text });
    // Optimistically render the user's prompt — the watcher will replace it
    // with the canonical entry from the transcript a second later.
    const optimistic: ChatEntry = {
      messageId: `pending-${Date.now()}`,
      role: 'user',
      content: text,
      ts: Date.now(),
      done: true,
      receivedAt: Date.now(),
    };
    set((s) => ({
      chatBySessionId: {
        ...s.chatBySessionId,
        [sessionId]: [...(s.chatBySessionId[sessionId] ?? []), optimistic].slice(
          -200,
        ),
      },
    }));
  },

  launchTask: (cwd, model, initialPrompt) => {
    get().send({
      type: 'launch_session',
      cwd,
      model,
      initialPrompt,
    });
  },

  send: () => {
    /* replaced when socket attaches */
  },
  attachSocket: (send) => set({ send }),
}));

export function selectPlanets(state: SolixState): Session[] {
  return Object.values(state.sessions).filter(
    (s) => !s.parentSessionId && s.kind !== 'advisor',
  );
}

export function selectAdvisorPlanets(state: SolixState): Session[] {
  return Object.values(state.sessions).filter(
    (s) => !s.parentSessionId && s.kind === 'advisor',
  );
}

export function selectMoons(state: SolixState, planetId: string): Session[] {
  return Object.values(state.sessions).filter(
    (s) => s.parentSessionId === planetId,
  );
}

export function selectEnabledAdvisors(state: SolixState): Advisor[] {
  return Object.values(state.advisors).filter((a) => a.enabled);
}

export function selectSkillsArray(state: SolixState): Skill[] {
  return Object.values(state.skills);
}
