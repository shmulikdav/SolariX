import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.SOLIX_PORT ?? '4242';
const BASE = `http://127.0.0.1:${PORT}`;

interface DemoOptions {
  port?: number;
  cwd?: string;
}

async function postEvent(payload: object): Promise<void> {
  await fetch(`${BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function ts(): number {
  return Date.now();
}

async function ensureReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pin(advisorId: string): Promise<void> {
  await fetch(`${BASE}/api/advisors/${encodeURIComponent(advisorId)}/pin`, {
    method: 'POST',
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function demoCmd(opts: DemoOptions = {}): Promise<void> {
  if (opts.port) process.env.SOLIX_PORT = String(opts.port);
  if (!(await ensureReachable())) {
    console.error(
      '[solix] server not reachable — run `solix start` first, then `solix demo` in another terminal',
    );
    process.exitCode = 1;
    return;
  }

  const cwd = opts.cwd ?? join(homedir(), 'demo-project');
  console.log(`[solix demo] seeding fake state for ${BASE}`);
  console.log(`[solix demo] using fake cwd: ${cwd}`);

  // Three user planets with different models and statuses.
  const sessions = [
    {
      id: 'demo-a',
      pid: 90001,
      cwd,
      payload: { session_id: 'demo-a', model: 'opus' },
      prompt: 'Refactor the orbital math for stable layout',
      tools: [
        { tool: 'Read', file: 'packages/web/src/scene/orbits.ts' },
        { tool: 'Edit', file: 'packages/web/src/scene/orbits.ts' },
        { tool: 'Bash', cmd: 'pnpm --filter @solix/web typecheck' },
      ],
    },
    {
      id: 'demo-b',
      pid: 90002,
      cwd,
      payload: { session_id: 'demo-b', model: 'sonnet' },
      prompt: 'Wire up the asteroid belt to real skill data',
      tools: [
        { tool: 'Read', file: 'packages/server/src/state/skills.ts' },
        { tool: 'Write', file: 'packages/web/src/scene/AsteroidBelt.tsx' },
      ],
    },
    {
      id: 'demo-c',
      pid: 90003,
      cwd,
      payload: { session_id: 'demo-c', model: 'haiku' },
      prompt: 'Document the context envelope strategy',
      tools: [],
    },
  ];

  for (const s of sessions) {
    await postEvent({
      event: 'session_start',
      pid: s.pid,
      cwd: s.cwd,
      ts: ts(),
      payload: s.payload,
    });
  }

  await sleep(150);

  // Start a mission on the first two sessions.
  for (const s of sessions.slice(0, 2)) {
    await postEvent({
      event: 'user_prompt_submit',
      pid: s.pid,
      cwd: s.cwd,
      ts: ts(),
      payload: { session_id: s.id, prompt: s.prompt },
    });
  }

  await sleep(100);

  // Tool calls on the first session — produces comet streaks.
  for (const t of sessions[0]!.tools) {
    if (t.tool === 'Bash') {
      await postEvent({
        event: 'pre_tool_bash',
        pid: sessions[0]!.pid,
        cwd: sessions[0]!.cwd,
        ts: ts(),
        payload: {
          session_id: sessions[0]!.id,
          command: t.cmd,
        },
      });
    } else {
      await postEvent({
        event: 'pre_tool_file',
        pid: sessions[0]!.pid,
        cwd: sessions[0]!.cwd,
        ts: ts(),
        payload: {
          session_id: sessions[0]!.id,
          tool_name: t.tool,
          tool_input: { file_path: t.file },
        },
      });
    }
    await sleep(80);
  }

  // Spawn a subagent (moon) on the second session.
  await postEvent({
    event: 'pre_tool_task',
    pid: sessions[1]!.pid,
    cwd: sessions[1]!.cwd,
    ts: ts(),
    payload: { session_id: sessions[1]!.id },
  });

  // Permission request on the third (will pulse red).
  await postEvent({
    event: 'notification',
    pid: sessions[2]!.pid,
    cwd: sessions[2]!.cwd,
    ts: ts(),
    payload: {
      session_id: sessions[2]!.id,
      tool_name: 'Bash',
      tool_input: { command: 'git push origin main' },
      message: 'Permission for git push',
    },
  });

  // Push context usage on two planets so the visual budget warnings show up.
  await fetch(`${BASE}/api/sessions/demo-a/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pct: 62 }),
  });
  await fetch(`${BASE}/api/sessions/demo-b/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pct: 87 }),
  });

  // Pin Compass so the user sees an advisor planet promoted to outer ring.
  await pin('compass');

  console.log(`[solix demo] seeded:`);
  console.log(`  • 3 user planets (opus / sonnet / haiku)`);
  console.log(`  • 1 active mission with tool-call comets`);
  console.log(`  • 1 subagent moon`);
  console.log(`  • 1 planet awaiting permission (red flare)`);
  console.log(`  • 1 planet at 87% context (orange flare)`);
  console.log(`  • Compass pinned (always-on)`);
  console.log(`[solix demo] open ${BASE} to see it.`);
}
