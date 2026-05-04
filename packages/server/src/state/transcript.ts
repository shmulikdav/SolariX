import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  statSync,
  watch,
  type FSWatcher,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Broadcaster } from '../broadcaster.js';
import type { DB } from '../db.js';

const TRANSCRIPT_BASE = join(homedir(), '.claude', 'projects');

// Heuristic context window for percentage. Claude Opus 4.x is ~200K. We pick
// a single anchor for now; per-model anchors land when transcripts include
// model metadata reliably (they already do — `message.model` is set).
const CONTEXT_BUDGETS_BY_MODEL: Record<string, number> = {
  'claude-opus-4-7': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  default: 200_000,
};

// Cap how much of an existing transcript we replay on first attach. Anything
// older falls off — the chat UI is for live conversation, not deep history.
const REPLAY_TAIL_BYTES = 64 * 1024;

function encodeProjectPath(cwd: string): string {
  return cwd.replace(/[/\\]/g, '-');
}

export function transcriptPathFor(cwd: string, sessionId: string): string {
  return join(TRANSCRIPT_BASE, encodeProjectPath(cwd), `${sessionId}.jsonl`);
}

interface AssistantContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
}

interface TranscriptLine {
  type?: string;
  uuid?: string;
  promptId?: string;
  timestamp?: string;
  message?: {
    role?: 'user' | 'assistant' | 'system' | 'tool';
    content?: string | AssistantContentBlock[];
    model?: string;
    id?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

interface WatcherRecord {
  sessionId: string;
  filePath: string;
  position: number;
  fsWatcher?: FSWatcher;
  initialRead: boolean;
}

export class TranscriptWatcherManager {
  private records = new Map<string, WatcherRecord>();
  private deferredRetry = new Map<string, NodeJS.Timeout>();

  constructor(
    private db: DB,
    private broadcaster: Broadcaster,
  ) {
    void this.db; // reserved for future persistence
  }

  /**
   * Begin tailing this session's transcript. Idempotent. If the file doesn't
   * exist yet, retries every second for up to 10 s (Claude Code creates the
   * file slightly after the SessionStart hook fires).
   */
  startWatching(sessionId: string, cwd: string): void {
    if (this.records.has(sessionId)) return;

    const filePath = transcriptPathFor(cwd, sessionId);
    if (!existsSync(filePath)) {
      this.scheduleRetry(sessionId, cwd, 0);
      return;
    }

    this.attach(sessionId, filePath);
  }

  private scheduleRetry(
    sessionId: string,
    cwd: string,
    attempt: number,
  ): void {
    if (attempt >= 10) return;
    const t = setTimeout(() => {
      this.deferredRetry.delete(sessionId);
      const filePath = transcriptPathFor(cwd, sessionId);
      if (existsSync(filePath)) {
        this.attach(sessionId, filePath);
      } else {
        this.scheduleRetry(sessionId, cwd, attempt + 1);
      }
    }, 1000);
    this.deferredRetry.set(sessionId, t);
  }

  private attach(sessionId: string, filePath: string): void {
    let size = 0;
    try {
      size = statSync(filePath).size;
    } catch {
      return;
    }
    // Replay the tail of the existing file so the chat panel has recent
    // context the moment a user opens it.
    const startPos = Math.max(0, size - REPLAY_TAIL_BYTES);
    const record: WatcherRecord = {
      sessionId,
      filePath,
      position: startPos,
      initialRead: startPos > 0,
    };
    this.records.set(sessionId, record);

    this.readNewLines(record);

    try {
      record.fsWatcher = watch(filePath, () => {
        // Coalesce rapid writes — readNewLines reads everything new.
        this.readNewLines(record);
      });
    } catch (err) {
      console.warn(
        `[transcript] could not watch ${filePath}:`,
        (err as Error).message,
      );
    }
  }

  private readNewLines(record: WatcherRecord): void {
    let stat;
    try {
      stat = statSync(record.filePath);
    } catch {
      return;
    }
    if (stat.size <= record.position) return;

    let buf: Buffer;
    try {
      const fd = openSync(record.filePath, 'r');
      buf = Buffer.alloc(stat.size - record.position);
      readSync(fd, buf, 0, buf.length, record.position);
      closeSync(fd);
    } catch (err) {
      console.warn(
        `[transcript] read failed for ${record.filePath}:`,
        (err as Error).message,
      );
      return;
    }
    record.position = stat.size;

    let text = buf.toString('utf8');
    // First read after tail-jump: drop any partial line at the start so the
    // JSON parser doesn't see truncated input.
    if (record.initialRead) {
      const nl = text.indexOf('\n');
      text = nl >= 0 ? text.slice(nl + 1) : '';
      record.initialRead = false;
    }

    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      this.processLine(record.sessionId, line);
    }
  }

  private processLine(sessionId: string, line: string): void {
    let obj: TranscriptLine;
    try {
      obj = JSON.parse(line) as TranscriptLine;
    } catch {
      return;
    }

    const message = obj.message;
    if (!message) return;
    const role = message.role;

    if (role === 'user') {
      this.emitUser(sessionId, obj);
    } else if (role === 'assistant') {
      this.emitAssistant(sessionId, obj);
    }
  }

  private emitUser(sessionId: string, obj: TranscriptLine): void {
    const content = this.flattenUserContent(obj.message?.content);
    if (!content) return;
    this.broadcaster.broadcast({
      type: 'chat_delta',
      sessionId,
      delta: {
        messageId:
          obj.uuid ?? obj.promptId ?? `u-${Date.now()}-${Math.random()}`,
        role: 'user',
        content,
        ts: this.parseTs(obj.timestamp),
        done: true,
      },
    });
  }

  private emitAssistant(sessionId: string, obj: TranscriptLine): void {
    const message = obj.message;
    if (!message) return;

    if (message.usage) {
      const total =
        (message.usage.input_tokens ?? 0) +
        (message.usage.cache_read_input_tokens ?? 0) +
        (message.usage.cache_creation_input_tokens ?? 0);
      const budget =
        CONTEXT_BUDGETS_BY_MODEL[message.model ?? 'default'] ??
        CONTEXT_BUDGETS_BY_MODEL.default!;
      const pct = Math.min(100, (total / budget) * 100);
      this.broadcaster.broadcast({
        type: 'context_update',
        sessionId,
        usagePct: pct,
      });
    }

    const content = this.flattenAssistantContent(message.content);
    if (!content) return;
    this.broadcaster.broadcast({
      type: 'chat_delta',
      sessionId,
      delta: {
        messageId: message.id ?? `a-${Date.now()}-${Math.random()}`,
        role: 'assistant',
        content,
        ts: this.parseTs(obj.timestamp),
        done: true,
      },
    });
  }

  private flattenUserContent(
    content: string | AssistantContentBlock[] | undefined,
  ): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    const parts: string[] = [];
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && b.text) parts.push(b.text);
      else if (b.type === 'tool_result') {
        const inner = b.content;
        const text =
          typeof inner === 'string'
            ? inner
            : Array.isArray(inner)
              ? inner
                  .map((x) =>
                    typeof x === 'object' && x !== null && 'text' in x
                      ? String((x as { text?: string }).text ?? '')
                      : '',
                  )
                  .join('\n')
              : '';
        if (text) parts.push(`[tool result]\n${text.slice(0, 600)}`);
      }
    }
    return parts.join('\n').trim();
  }

  private flattenAssistantContent(
    content: string | AssistantContentBlock[] | undefined,
  ): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    const parts: string[] = [];
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && b.text) {
        parts.push(b.text);
      } else if (b.type === 'tool_use' && b.name) {
        const inputSummary = JSON.stringify(b.input ?? {}).slice(0, 120);
        parts.push(`▸ ${b.name} ${inputSummary}`);
      } else if (b.type === 'thinking' && b.thinking) {
        // Thinking blocks are noisy; show only the first ~100 chars.
        const t = b.thinking.replace(/\s+/g, ' ').slice(0, 100);
        if (t) parts.push(`💭 ${t}…`);
      }
    }
    return parts.join('\n\n').trim();
  }

  private parseTs(value?: string): number {
    if (!value) return Date.now();
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : Date.now();
  }

  stopWatching(sessionId: string): void {
    const r = this.records.get(sessionId);
    if (r?.fsWatcher) {
      try {
        r.fsWatcher.close();
      } catch {
        /* ignore */
      }
    }
    this.records.delete(sessionId);
    const t = this.deferredRetry.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.deferredRetry.delete(sessionId);
    }
  }

  shutdownAll(): void {
    for (const id of [...this.records.keys()]) this.stopWatching(id);
    for (const id of [...this.deferredRetry.keys()]) this.stopWatching(id);
  }
}
