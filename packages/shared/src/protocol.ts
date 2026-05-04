import type {
  ChatDelta,
  Mission,
  Model,
  Project,
  Session,
  ToolCall,
} from './types.js';

export type ServerMessage =
  | {
      type: 'snapshot';
      projects: Project[];
      sessions: Session[];
      missions: Mission[];
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
    }
  | { type: 'terminate_session'; sessionId: string };
