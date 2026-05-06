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

export type SessionKind = 'user' | 'advisor';

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
  kind: SessionKind;
  advisorRole?: string;
  parentSessionId?: string;
  contextUsagePct: number;
  currentMissionId?: string;
  lastCompletedMissionId?: string;
  orbitSlot: number;
  name?: string;
  /** When this session was launched into a freshly-created git worktree
   * (Sprint I), the worktree path is stored here. List view renders a
   * branch chip from it. */
  worktreePath?: string;
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
  /** Plain-text summary of the most recent failure inside this mission.
   * Populated server-side from post-tool events with is_error=true.
   * Surfaced in MissionView for failed missions. */
  errorSummary?: string;
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

export interface Advisor {
  id: string;
  role: string;
  codename: string;
  name: string;
  description: string;
  glyph: string;
  color: string;
  defaultModel: Model;
  agentMdPath: string;
  enabled: boolean;
  pinned: boolean;
  pinnedSessionId?: string;
  requiredSkills: string[];
  texturePack?: string;
}

export type SkillSource = 'anthropic' | 'solix' | 'user';

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  manifestPath: string;
  installedInProjects: string[];
}

export interface GalaxyManifestAdvisor {
  role: string;
  pinned: boolean;
  model?: Model;
}

export interface GalaxyManifestSkill {
  id: string;
  source: SkillSource;
}

export interface GalaxyManifestProject {
  name: string;
  cwd?: string;
  remoteHint?: string;
}

export interface GalaxyManifestScheduledTask {
  prompt: string;
  cron: string;
}

export interface GalaxyManifest {
  version: 1;
  name: string;
  author?: string;
  description?: string;
  advisors: GalaxyManifestAdvisor[];
  skills: GalaxyManifestSkill[];
  projects: GalaxyManifestProject[];
  scheduledTasks?: GalaxyManifestScheduledTask[];
  theme?: { sunColor?: string; bgColor?: string };
}

/**
 * Timeline events — synthesized from missions/tool_calls/sessions tables on
 * demand for the playback feature. Not persisted as a separate table; the
 * server derives them at query time so we never duplicate state.
 */
export type TimelineEventType =
  | 'session_started'
  | 'session_terminated'
  | 'mission_started'
  | 'mission_completed'
  | 'tool_call';

export interface TimelineEvent {
  ts: number;
  type: TimelineEventType;
  sessionId: string;
  projectId?: string;
  cwd?: string;
  // Per-event payload bits — kept small. The client uses these to update
  // its derived "scene at time T" without round-tripping to the server.
  missionId?: string;
  missionShortName?: string;
  missionPrompt?: string;
  toolName?: string;
  status?: SessionStatus;
}

/**
 * Audit log — append-only history of every privileged action a user took
 * (or the system took on their behalf). Persisted in SQLite under
 * `audit_events`. The Audit tab in GalaxyPanel reads this; downstream
 * exports (CSV / Slack relay) are out of scope for v1 but the shape is
 * stable enough to support them later.
 */
export type AuditKind =
  | 'permission_approved'
  | 'permission_denied'
  | 'advisor_invoked'
  | 'advisor_pinned'
  | 'advisor_unpinned'
  | 'galaxy_imported'
  | 'galaxy_exported'
  | 'galaxy_published'
  | 'skill_installed'
  | 'session_terminated';

export interface AuditEvent {
  id: string;
  ts: number;
  kind: AuditKind;
  sessionId?: string;
  advisorId?: string;
  projectId?: string;
  /** Short human-readable line — e.g. "Approved Bash for demo-c: git push…" */
  summary: string;
  /** Free-form structured detail; kept JSON-string in DB. */
  payload?: Record<string, unknown>;
}

/**
 * Persisted snapshot of a galaxy manifest. Created on every export so the
 * user can browse past states, see what changed between versions, and
 * restore a previous configuration if they want.
 */
export interface GalaxyVersion {
  id: string;
  ts: number;
  /** Sequential index — v1, v2, v3… for human-readable labelling. */
  ordinal: number;
  /** What name was passed at export time. */
  name: string;
  author?: string;
  description?: string;
  /** Full manifest, kept JSON-string in DB. */
  manifest: GalaxyManifest;
}

/**
 * Manifest diff result. Pure function output; consumed by the Versions
 * UI to show "what changed between v3 and v5."
 */
export interface GalaxyManifestDiff {
  advisors: {
    added: string[];
    removed: string[];
    pinChanged: { role: string; from: boolean; to: boolean }[];
  };
  skills: {
    added: string[];
    removed: string[];
  };
  projects: {
    added: string[];
    removed: string[];
  };
}
