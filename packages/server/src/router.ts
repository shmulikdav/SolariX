import { nanoid } from 'nanoid';
import type { GalaxyManifest, HookEvent, Model } from '@solix/shared';
import type { DB } from './db.js';
import type { Broadcaster } from './broadcaster.js';
import { ensureProject } from './state/projects.js';
import {
  getSession,
  setSessionContextUsage,
  setSessionMission,
  setSessionStatus,
  upsertSession,
} from './state/sessions.js';
import {
  addTouchedFile,
  bumpSubagentCount,
  bumpToolCallCount,
  completeMission,
  getMission,
  startMission,
} from './state/missions.js';
import { recordToolCall } from './state/toolcalls.js';
import {
  getAdvisor,
  setAdvisorPinned,
} from './state/advisors.js';
import { buildContextEnvelope } from './state/context.js';
import type { Launcher } from './launcher.js';
import type { TranscriptWatcherManager } from './state/transcript.js';

interface PendingPermission {
  requestId: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  createdAt: number;
}

export class EventRouter {
  private permissions = new Map<string, PendingPermission>();

  constructor(
    private db: DB,
    private broadcaster: Broadcaster,
    private launcher?: Launcher,
    private transcripts?: TranscriptWatcherManager,
  ) {}

  setLauncher(launcher: Launcher): void {
    this.launcher = launcher;
  }

  handleHookEvent(event: HookEvent): void {
    try {
      switch (event.event) {
        case 'session_start':
          this.onSessionStart(event);
          break;
        case 'user_prompt_submit':
          this.onUserPromptSubmit(event);
          break;
        case 'stop':
          this.onStop(event);
          break;
        case 'subagent_stop':
          this.onSubagentStop(event);
          break;
        case 'pre_tool_task':
          this.onPreToolTask(event);
          break;
        case 'pre_tool_file':
          this.onPreToolFile(event);
          break;
        case 'pre_tool_bash':
          this.onPreToolBash(event);
          break;
        case 'post_tool':
          this.onPostTool(event);
          break;
        case 'notification':
          this.onNotification(event);
          break;
        default:
          console.warn('[router] unknown event', event);
      }
    } catch (err) {
      console.error('[router] error handling event', event.event, err);
    }
  }

  private extractSessionId(event: HookEvent): string {
    const p = event.payload as Record<string, unknown>;
    if (typeof p.session_id === 'string') return p.session_id;
    if (typeof p.sessionId === 'string') return p.sessionId;
    return `pid-${event.pid}`;
  }

  private extractParentSessionId(event: HookEvent): string | undefined {
    const p = event.payload as Record<string, unknown>;
    if (typeof p.parent_session_id === 'string') return p.parent_session_id;
    if (typeof p.parentSessionId === 'string') return p.parentSessionId;
    return undefined;
  }

  private extractModel(event: HookEvent): Model {
    const p = event.payload as Record<string, unknown>;
    const m = p.model;
    if (typeof m === 'string') return m as Model;
    return 'default';
  }

  private onSessionStart(event: HookEvent): void {
    const project = ensureProject(this.db, event.cwd);
    const sessionId = this.extractSessionId(event);
    const advisorRole = this.launcher?.advisorRoleForPid(event.pid);
    const session = upsertSession(this.db, {
      id: sessionId,
      pid: event.pid,
      projectId: project.id,
      cwd: event.cwd,
      origin:
        (event.payload as Record<string, unknown>).origin === 'internal'
          ? 'internal'
          : advisorRole
            ? 'internal'
            : 'external',
      model: this.extractModel(event),
      parentSessionId: this.extractParentSessionId(event),
      kind: advisorRole ? 'advisor' : 'user',
      advisorRole,
    });
    this.broadcaster.broadcast({ type: 'session_upsert', session });
    // Start tailing the session's transcript so the Chat tab streams in real
    // time. Skipped for moons (subagents) — they share the parent's transcript.
    if (!session.parentSessionId) {
      this.transcripts?.startWatching(sessionId, event.cwd);
    }
  }

  private onUserPromptSubmit(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const p = event.payload as Record<string, unknown>;
    const prompt =
      typeof p.prompt === 'string' ? p.prompt : 'untitled prompt';

    let session = getSession(this.db, sessionId);
    if (!session) {
      const project = ensureProject(this.db, event.cwd);
      session = upsertSession(this.db, {
        id: sessionId,
        pid: event.pid,
        projectId: project.id,
        cwd: event.cwd,
        origin: 'external',
        model: this.extractModel(event),
      });
    }

    const mission = startMission(this.db, sessionId, prompt);
    const updated = setSessionMission(this.db, sessionId, mission.id);
    const active = updated
      ? setSessionStatus(this.db, sessionId, 'active')
      : null;

    this.broadcaster.broadcast({ type: 'mission_upsert', mission });
    if (active) {
      this.broadcaster.broadcast({ type: 'session_upsert', session: active });
    }
  }

  private onStop(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const session = getSession(this.db, sessionId);
    if (!session) return;

    if (session.currentMissionId) {
      const mission = completeMission(
        this.db,
        session.currentMissionId,
        'completed',
      );
      if (mission) {
        this.broadcaster.broadcast({ type: 'mission_upsert', mission });
      }
    }

    const updated = setSessionMission(this.db, sessionId, null);
    const idle = updated
      ? setSessionStatus(this.db, sessionId, 'idle')
      : null;
    if (idle) {
      this.broadcaster.broadcast({ type: 'session_upsert', session: idle });
    }
  }

  private onSubagentStop(event: HookEvent): void {
    const subSessionId = this.extractSessionId(event);
    const session = getSession(this.db, subSessionId);
    if (!session) return;
    const terminated = setSessionStatus(this.db, subSessionId, 'terminated');
    if (terminated) {
      this.broadcaster.broadcast({
        type: 'session_remove',
        sessionId: subSessionId,
      });
    }
  }

  private onPreToolTask(event: HookEvent): void {
    const parentSessionId = this.extractSessionId(event);
    const parent = getSession(this.db, parentSessionId);
    if (!parent) return;

    const subId = nanoid();
    const sub = upsertSession(this.db, {
      id: subId,
      pid: event.pid,
      projectId: parent.projectId,
      cwd: event.cwd,
      origin: parent.origin,
      model: parent.model,
      parentSessionId: parentSessionId,
    });
    const active = setSessionStatus(this.db, subId, 'active');

    if (parent.currentMissionId) {
      bumpSubagentCount(this.db, parent.currentMissionId);
      const mission = getMission(this.db, parent.currentMissionId);
      if (mission)
        this.broadcaster.broadcast({ type: 'mission_upsert', mission });
    }

    this.broadcaster.broadcast({
      type: 'session_upsert',
      session: active ?? sub,
    });
  }

  private onPreToolFile(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const session = getSession(this.db, sessionId);
    if (!session) return;
    const p = event.payload as Record<string, unknown>;
    const tool =
      typeof p.tool_name === 'string' ? p.tool_name : 'File';
    const filePath =
      typeof p.file_path === 'string'
        ? p.file_path
        : typeof (p.tool_input as { file_path?: string })?.file_path ===
            'string'
          ? (p.tool_input as { file_path?: string }).file_path!
          : '';

    const toolCall = recordToolCall(this.db, {
      sessionId,
      missionId: session.currentMissionId,
      tool,
      args: { file_path: filePath },
    });

    if (session.currentMissionId && filePath) {
      addTouchedFile(this.db, session.currentMissionId, filePath);
    }

    this.broadcaster.broadcast({ type: 'tool_call', toolCall });
  }

  private onPreToolBash(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const session = getSession(this.db, sessionId);
    if (!session) return;
    const p = event.payload as Record<string, unknown>;
    const command =
      typeof p.command === 'string'
        ? p.command
        : typeof (p.tool_input as { command?: string })?.command === 'string'
          ? (p.tool_input as { command?: string }).command!
          : '';
    const toolCall = recordToolCall(this.db, {
      sessionId,
      missionId: session.currentMissionId,
      tool: 'Bash',
      args: { command },
    });
    this.broadcaster.broadcast({ type: 'tool_call', toolCall });
  }

  private onPostTool(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const session = getSession(this.db, sessionId);
    if (!session?.currentMissionId) return;
    bumpToolCallCount(this.db, session.currentMissionId);
    const mission = getMission(this.db, session.currentMissionId);
    if (mission)
      this.broadcaster.broadcast({ type: 'mission_upsert', mission });
  }

  private onNotification(event: HookEvent): void {
    const sessionId = this.extractSessionId(event);
    const p = event.payload as Record<string, unknown>;
    const message =
      typeof p.message === 'string' ? p.message : 'Permission requested';
    const tool =
      typeof p.tool_name === 'string' ? p.tool_name : 'unknown';

    const requestId = nanoid();
    this.permissions.set(requestId, {
      requestId,
      sessionId,
      tool,
      args: (p.tool_input as Record<string, unknown>) ?? {},
      createdAt: Date.now(),
    });

    const updated = setSessionStatus(this.db, sessionId, 'awaiting_permission');
    if (updated) {
      this.broadcaster.broadcast({
        type: 'session_upsert',
        session: updated,
      });
    }
    this.broadcaster.broadcast({
      type: 'permission_request',
      sessionId,
      tool,
      args: (p.tool_input as Record<string, unknown>) ?? {},
      requestId,
    });
    this.broadcaster.broadcast({
      type: 'toast',
      level: 'warn',
      message: `Permission requested: ${message}`,
    });
  }

  invokeAdvisor(
    advisorId: string,
    targetSessionId?: string,
    prompt?: string,
  ): { ok: boolean; envelope?: string } {
    const advisor = getAdvisor(this.db, advisorId);
    if (!advisor) return { ok: false };
    const envelope = buildContextEnvelope(this.db, {
      advisorId,
      targetSessionId,
      userPrompt: prompt,
    });
    if (!envelope) return { ok: false };

    const target = envelope.targetSession;
    const targetLabel = target
      ? `${target.name ?? target.id.slice(0, 8)}`
      : 'project level';
    this.broadcaster.broadcast({
      type: 'toast',
      level: 'info',
      message: `Invoke ${advisor.codename} → ${targetLabel} · ${envelope.recentMissions.length} mission(s) in envelope`,
    });
    return { ok: true, envelope: envelope.prompt };
  }

  pinAdvisor(advisorId: string, cwd: string = process.cwd()): boolean {
    if (!this.launcher) {
      // No launcher available — flip DB state but don't spawn anything.
      const advisor = setAdvisorPinned(this.db, advisorId, true);
      if (!advisor) return false;
      this.broadcaster.broadcast({ type: 'advisor_upsert', advisor });
      return true;
    }
    const ok = this.launcher.pin(advisorId, cwd);
    const advisor = getAdvisor(this.db, advisorId);
    if (advisor)
      this.broadcaster.broadcast({ type: 'advisor_upsert', advisor });
    return ok;
  }

  unpinAdvisor(advisorId: string): boolean {
    if (this.launcher) {
      this.launcher.unpin(advisorId);
    } else {
      setAdvisorPinned(this.db, advisorId, false);
    }
    const advisor = getAdvisor(this.db, advisorId);
    if (advisor)
      this.broadcaster.broadcast({ type: 'advisor_upsert', advisor });
    return true;
  }

  resolvePermission(requestId: string, approved: boolean): boolean {
    const pending = this.permissions.get(requestId);
    if (!pending) return false;
    this.permissions.delete(requestId);
    const status = approved ? 'active' : 'idle';
    const session = setSessionStatus(this.db, pending.sessionId, status);
    if (session)
      this.broadcaster.broadcast({ type: 'session_upsert', session });
    return true;
  }

  launchInternalSession(opts: {
    cwd: string;
    model?: Model;
    initialPrompt?: string;
  }): { ok: boolean; sessionId?: string } {
    if (!this.launcher) return { ok: false };
    if (!opts.initialPrompt?.trim()) {
      this.broadcaster.broadcast({
        type: 'toast',
        level: 'warn',
        message: 'Launch needs an initial prompt',
      });
      return { ok: false };
    }
    return this.launcher.launch({
      cwd: opts.cwd,
      model: opts.model,
      initialPrompt: opts.initialPrompt,
    });
  }

  sendPromptToSession(sessionId: string, text: string): boolean {
    if (!this.launcher) return false;
    return this.launcher.sendPromptToInternal(sessionId, text);
  }

  /** Pending permission requests, used by the WS snapshot so a fresh
   * client connection sees what's already waiting on the server. */
  pendingPermissions(): PendingPermission[] {
    return [...this.permissions.values()];
  }

  broadcastGalaxyImported(manifest: GalaxyManifest): void {
    this.broadcaster.broadcast({ type: 'galaxy_imported', manifest });
    this.broadcaster.broadcast({
      type: 'toast',
      level: 'info',
      message: `Galaxy "${manifest.name}" imported`,
    });
  }

  setContextUsage(sessionId: string, pct: number): void {
    const session = setSessionContextUsage(this.db, sessionId, pct);
    if (session) {
      this.broadcaster.broadcast({
        type: 'context_update',
        sessionId,
        usagePct: session.contextUsagePct,
      });
    }
  }
}
