import { describe, expect, it } from 'vitest';
import { buildPrintArgs, parseClaudeJsonResult } from './launcher.js';

describe('buildPrintArgs', () => {
  const full = { sessionId: true, jsonOutput: true };

  it('passes --session-id (correlation) and --output-format json (cost)', () => {
    const args = buildPrintArgs(
      { model: 'haiku', sessionId: 'uuid-1', prompt: 'hi' },
      full,
    );
    expect(args).toContain('--print');
    expect(args).toContain('--session-id');
    expect(args[args.indexOf('--session-id') + 1]).toBe('uuid-1');
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args).toContain('--model');
    expect(args[args.length - 1]).toBe('hi'); // prompt is last
  });

  it('omits --model for the default model', () => {
    const args = buildPrintArgs({ model: 'default', prompt: 'p' }, full);
    expect(args).not.toContain('--model');
  });

  it('degrades gracefully when the installed claude lacks the flags', () => {
    const args = buildPrintArgs(
      { sessionId: 'uuid-1', prompt: 'p' },
      { sessionId: false, jsonOutput: false },
    );
    expect(args).not.toContain('--session-id');
    expect(args).not.toContain('--output-format');
    expect(args).toEqual(['--print', 'p']);
  });
});

describe('parseClaudeJsonResult', () => {
  it('extracts result text + total_cost_usd from the envelope', () => {
    const r = parseClaudeJsonResult(
      JSON.stringify({
        type: 'result',
        result: 'the answer',
        is_error: false,
        total_cost_usd: 0.0123,
      }),
    );
    expect(r).toEqual({ result: 'the answer', isError: false, costUsd: 0.0123 });
  });

  it('flags is_error', () => {
    const r = parseClaudeJsonResult(
      JSON.stringify({ result: 'boom', is_error: true }),
    );
    expect(r?.isError).toBe(true);
    expect(r?.costUsd).toBeUndefined();
  });

  it('returns null for non-envelope output (plain text / array / garbage)', () => {
    expect(parseClaudeJsonResult('just some text')).toBeNull();
    expect(parseClaudeJsonResult('[{"type":"message"}]')).toBeNull();
    expect(parseClaudeJsonResult('')).toBeNull();
    expect(parseClaudeJsonResult('{not json')).toBeNull();
  });
});
