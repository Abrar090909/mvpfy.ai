import { describe, expect, it } from 'vitest';
import { ShellRunner, TailBuffer } from './exec';

describe('TailBuffer', () => {
  it('returns everything when it fits', () => {
    const b = new TailBuffer(10);
    b.push('abc');
    b.push('def');
    expect(b.toString()).toBe('abcdef');
  });

  it('keeps only the tail, marked as cut, however much arrives', () => {
    const b = new TailBuffer(5);
    for (let i = 0; i < 10_000; i++) b.push('0123456789');
    expect(b.toString()).toBe('…56789');
  });

  it('never holds much more than its limit while output streams in', () => {
    const b = new TailBuffer(100);
    for (let i = 0; i < 1_000; i++) {
      b.push('x'.repeat(37));
      expect((b as unknown as { text: string }).text.length).toBeLessThanOrEqual(237);
    }
  });
});

describe.runIf(process.platform !== 'win32')('ShellRunner, against a real shell', () => {
  it('ends the moment the command does, taking its background processes with it', async () => {
    // A command that leaves something running in the background — the shape
    // of an agent starting a dev server — used to hold stdout open, so the
    // run did not end until its timeout.
    const runner = new ShellRunner();
    const started = Date.now();
    const res = await runner.run('sleep 30 & echo $!', { cwd: process.cwd(), timeoutMs: 20_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(res.timedOut).toBe(false);
    const leftover = Number(res.stdout.trim());
    const alive = (() => {
      try {
        process.kill(leftover, 0);
        return true;
      } catch {
        return false;
      }
    })();
    expect(alive).toBe(false);
  });

  it('keeps the tail of a long output', async () => {
    const res = await new ShellRunner().run('seq 1 100000', {
      cwd: process.cwd(),
      maxOutputBytes: 20,
    });
    expect(res.stdout.startsWith('…')).toBe(true);
    expect(res.stdout.trim().endsWith('100000')).toBe(true);
  });
});
