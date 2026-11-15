import { describe, expect, it } from 'vitest';
import { scopedSet } from './useRuns';

describe('scopedSet', () => {
  it('remembers what an earlier instance handled, as a remounted hook needs', () => {
    // ProjectShell remounts on every project switch. Each hook asks for its
    // set again; the run it acted on before the switch must still read as
    // handled, or the bootstrap, the seed, the move to Testing happen twice.
    const store = new Set<string>();
    scopedSet(store, 'p1:setup-chain').add('run-1');
    const afterRemount = scopedSet(store, 'p1:setup-chain');
    expect(afterRemount.has('run-1')).toBe(true);
    expect(afterRemount.has('run-2')).toBe(false);
  });

  it('keeps scopes apart, so one hook acting on a run does not hide it from another', () => {
    const store = new Set<string>();
    scopedSet(store, 'p1:setup-chain').add('run-1');
    expect(scopedSet(store, 'p1:readiness-chain').has('run-1')).toBe(false);
    expect(scopedSet(store, 'p2:setup-chain').has('run-1')).toBe(false);
  });

  it('can forget an id', () => {
    const set = scopedSet(new Set<string>(), 'p1:plan-reopened');
    set.add('paging');
    expect(set.delete('paging')).toBe(true);
    expect(set.has('paging')).toBe(false);
  });
});
