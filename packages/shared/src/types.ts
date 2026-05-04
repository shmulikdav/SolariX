export type SessionStatus =
  | 'spawning'
  | 'active'
  | 'idle'
  | 'awaiting_input'
  | 'awaiting_permission'
  | 'plan_review'
  | 'error'
  | 'terminated';

export type Model = 'opus' | 'sonnet' | 'haiku' | 'default' | string;

export type SessionOrigin = 'external' | 'internal';

export interface Session {
  id: string;
  pid: number;
  cwd: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  model: Model;
  origin: SessionOrigin;
  parentSessionId?: string;
  contextUsagePct: number;
  currentMissionId?: string;
  lastCompletedMissionId?: string;
  orbitSlot: number;
  name?: string;
}

export type MissionStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface MissionMetrics {
  durationMs?: number;
  totalTokens?: number;
  linesAdded?: number;
  linesRemoved?: number;
  subagentCount: number;
  toolCallCount: number;
}

export interface Mission {
  id: string;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  prompt: string;
  shortName: string;
  longSummary?: string;
  status: MissionStatus;
  metrics: MissionMetrics;
  filesTouched: string[];
}

export type ToolCallStatus = 'running' | 'ok' | 'error';

export interface ToolCall {
  id: string;
  sessionId: string;
  missionId?: string;
  tool: string;
  args: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
  status: ToolCallStatus;
}

export interface Project {
  id: string;
  cwd: string;
  name: string;
  firstSeenAt: number;
  lastActiveAt: number;
}

export interface ScheduledTask {
  id: string;
  projectId: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: number;
}

export interface ChatDelta {
  messageId: string;
  role: ChatMessage['role'];
  content: string;
  ts: number;
  done: boolean;
}
