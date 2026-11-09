import { describe, expect, it } from 'vitest';
import { mintsNewId, sessionPlan } from './featureSession';

const newId = () => 'fresh-id';

describe('choosing a feature’s conversation', () => {
  describe('claude', () => {
    const claude = { agent: 'claude' as const, newId };

    it('opens one when the feature has none', () => {
      expect(sessionPlan({ ...claude, open: true })).toEqual({ id: 'fresh-id', resume: false });
    });

    it('continues the feature’s conversation on a later run', () => {
      expect(sessionPlan({ ...claude, existing: 'old-id', open: false })).toEqual({
        id: 'old-id',
        resume: true,
      });
    });

    it('reuses the id when the opening run is repeated', () => {
      // Re-planning a feature keeps the conversation it already had.
      expect(sessionPlan({ ...claude, existing: 'old-id', open: true })).toEqual({
        id: 'old-id',
        resume: false,
      });
    });

    it('never reuses an id after the conversation was found missing', () => {
      // The bug this exists to stop: the repair forgot the id and started a
      // run in the same tick, which read the forgotten id back out of a
      // stale closure and resumed the same dead conversation. The caller
      // says "reopen" outright now, so what state currently holds cannot
      // matter.
      const session = sessionPlan({ ...claude, existing: 'dead-id', open: false, reopen: true });
      expect(session).toEqual({ id: 'fresh-id', resume: false });
      expect(session?.id).not.toBe('dead-id');
    });

    it('reopens with a new id even when state still says otherwise', () => {
      // Belt and braces: `open` does not rescue it either.
      expect(sessionPlan({ ...claude, existing: 'dead-id', open: true, reopen: true })?.id).toBe(
        'fresh-id'
      );
    });
  });

  describe('codex', () => {
    const codex = { agent: 'codex' as const, newId };

    it('opens a thread unasked, because it cannot be given an id', () => {
      expect(sessionPlan({ ...codex, open: true })).toBeUndefined();
    });

    it('resumes the thread it announced last time', () => {
      expect(sessionPlan({ ...codex, existing: 'thread-1', open: false })).toEqual({
        id: 'thread-1',
        resume: true,
      });
    });

    it('starts a new thread when the last one was gone', () => {
      // Not a minted id — codex would reject one it never opened.
      expect(
        sessionPlan({ ...codex, existing: 'dead-thread', open: false, reopen: true })
      ).toBeUndefined();
    });
  });

  describe('mintsNewId', () => {
    it('is true only when there is a new id to remember', () => {
      expect(mintsNewId({ id: 'fresh-id', resume: false }, undefined)).toBe(true);
      expect(mintsNewId({ id: 'fresh-id', resume: false }, 'dead-id')).toBe(true);
      expect(mintsNewId({ id: 'old-id', resume: true }, 'old-id')).toBe(false);
      expect(mintsNewId({ id: 'old-id', resume: false }, 'old-id')).toBe(false);
      expect(mintsNewId(undefined, 'anything')).toBe(false);
    });
  });
});
