import type {
  Advisor,
  ChatDelta,
  GalaxyManifest,
  Mission,
  Model,
  Project,
  Session,
  Skill,
  ToolCall,
} from './types.js';

export type ServerMessage =
  | {
      type: 'snapshot';
      projects: Project[];
      sessions: Session[];
      missions: Mission[];
      advisors: Advisor[];
      skills: Skill[];
    }
  | { type: 'session_upsert'; session: Session }
  | { type: 'session_remove'; sessionId: string }
  | { type: 'mission_upsert'; mission: Mission }
  | { type: 'tool_call'; toolCall: ToolCall }
  | {
      type: 'permission_request';
      sessionId: string;
      tool: string;
      args: Record<string, unknown>;
      requestId: string;
    }
  | { type: 'plan_proposed'; sessionId: string; plan: string }
  | { type: 'chat_delta'; sessionId: string; delta: ChatDelta }
  | { type: 'context_update'; sessionId: string; usagePct: number }
  | { type: 'advisor_upsert'; advisor: Advisor }
  | { type: 'skill_upsert'; skill: Skill }
  | { type: 'galaxy_imported'; manifest: GalaxyManifest }
  | {
      type: 'toast';
      level: 'info' | 'warn' | 'error';
      message: string;
    };

export type ClientMessage =
  | { type: 'subscribe_project'; projectId: string }
  | { type: 'send_prompt'; sessionId: string; text: string }
  | { type: 'permission_response'; requestId: string; approved: boolean }
  | {
      type: 'plan_response';
      sessionId: string;
      approved: boolean;
      feedback?: string;
    }
  | {
      type: 'launch_session';
      cwd: string;
      model?: Model;
      initialPrompt?: string;
      /** When set, the server creates a fresh git worktree on this branch
       * (under ~/.solix/worktrees/...) and spawns claude there instead of in
       * `cwd`. Existing branches are reused; new ones branch from
       * `worktreeBaseRef` (defaults to HEAD). */
      worktreeBranch?: string;
      worktreeBaseRef?: string;
    }
  | { type: 'terminate_session'; sessionId: string }
  | { type: 'invoke_advisor'; advisorId: string; targetSessionId?: string; prompt?: string }
  | { type: 'pin_advisor'; advisorId: string }
  | { type: 'unpin_advisor'; advisorId: string };
