import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { posixQuote } from './shellQuote';

describe('posixQuote', () => {
  it('wraps plain values and neutralises everything a shell would act on', () => {
    expect(posixQuote('hello')).toBe("'hello'");
    expect(posixQuote('$(rm -rf ~) `id`; a && b')).toBe("'$(rm -rf ~) `id`; a && b'");
    expect(posixQuote("o'brien")).toBe("'o'\\''brien'");
  });

  it.runIf(process.platform !== 'win32')('round-trips through a real shell exactly', () => {
    for (const value of ["o'brien", '$HOME', 'a b\tc', '`id`', 'line\nbreak', "''", '']) {
      const echoed = execFileSync('/bin/sh', ['-c', `printf %s ${posixQuote(value)}`]).toString();
      expect(echoed).toBe(value);
    }
  });
});
