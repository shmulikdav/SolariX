import type { ScheduledTask } from '@solix/shared';

const PORT = process.env.SOLIX_PORT ?? '4242';
const BASE = `http://127.0.0.1:${PORT}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

function unreachable(err: unknown): void {
  console.error(`[solix] could not reach server at ${BASE}: ${String(err)}`);
  console.error('[solix] is `solix start` running?');
  process.exitCode = 1;
}

export async function listSchedulesCmd(): Promise<void> {
  try {
    const list = await api<ScheduledTask[]>('/api/schedules');
    if (!list.length) {
      console.log('No schedules. Add one with `solix schedule add`.');
      return;
    }
    console.log('id        every  state   next run             prompt');
    for (const s of list) {
      const next = new Date(s.nextRunAt).toLocaleString();
      const state = s.enabled ? 'on ' : 'off';
      console.log(
        `  ${s.id.padEnd(8)} ${s.cron.padEnd(5)} [${state}] ${next.padEnd(20)} ${s.prompt.slice(0, 40)}`,
      );
    }
  } catch (err) {
    unreachable(err);
  }
}

export async function addScheduleCmd(
  prompt: string,
  opts: { cwd?: string; every?: string; name?: string },
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const cadence = opts.every ?? '1h';
  try {
    const s = await api<ScheduledTask>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({ cwd, prompt, cadence, name: opts.name }),
    });
    console.log(
      `[solix] scheduled ${s.id} — every ${s.cron} in ${cwd}\n        next run: ${new Date(s.nextRunAt).toLocaleString()}`,
    );
  } catch (err) {
    unreachable(err);
  }
}

async function toggle(id: string, enabled: boolean): Promise<void> {
  try {
    await api(`/api/schedules/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    console.log(`[solix] schedule ${id} → ${enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    unreachable(err);
  }
}

export const enableScheduleCmd = (id: string): Promise<void> => toggle(id, true);
export const disableScheduleCmd = (id: string): Promise<void> =>
  toggle(id, false);

export async function removeScheduleCmd(id: string): Promise<void> {
  try {
    await api(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    console.log(`[solix] removed schedule ${id}`);
  } catch (err) {
    unreachable(err);
  }
}
