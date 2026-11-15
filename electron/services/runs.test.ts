import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunOutputEvent } from '../../shared/types';
import { batchedOutput } from './runs';

afterEach(() => {
  vi.useRealTimers();
});

describe('batchedOutput', () => {
  it('sends many chunks as one message, after a short wait', () => {
    vi.useFakeTimers();
    const sent: RunOutputEvent[] = [];
    const out = batchedOutput('r1', (ev) => sent.push(ev), 33);
    for (let i = 0; i < 100; i++) out.push('stdout', `${i}\n`);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(33);
    expect(sent).toHaveLength(1);
    expect(sent[0].chunk.split('\n')).toHaveLength(101);
  });

  it('keeps stdout and stderr in the order they were printed', () => {
    vi.useFakeTimers();
    const sent: RunOutputEvent[] = [];
    const out = batchedOutput('r1', (ev) => sent.push(ev));
    out.push('stdout', 'a');
    out.push('stdout', 'b');
    out.push('stderr', 'c');
    out.push('stdout', 'd');
    out.flush();
    expect(sent.map((e) => [e.stream, e.chunk])).toEqual([
      ['stdout', 'ab'],
      ['stderr', 'c'],
      ['stdout', 'd'],
    ]);
  });

  it('sends everything at once when flushed, as an exit does', () => {
    const sent: RunOutputEvent[] = [];
    const out = batchedOutput('r1', (ev) => sent.push(ev), 10_000);
    out.push('stdout', 'https://github.com/acme/api/pull/7\n');
    out.flush();
    expect(sent).toEqual([
      { runId: 'r1', stream: 'stdout', chunk: 'https://github.com/acme/api/pull/7\n' },
    ]);
    out.flush();
    expect(sent).toHaveLength(1);
  });
});
