import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractPrUrl, RunHandle } from './agentRunner';
import { loadRunHistory, mergeHistory, saveRunHistory } from './runHistory';

/**
 * How long chunks are gathered before React is told. Short enough that a
 * streaming log still looks live, long enough that sixty chunks a second
 * become six renders.
 */
const LOG_FLUSH_MS = 100;

/** A set of ids, as the hooks use one to act on each finished run once. */
export interface HandledSet {
  has(id: string): boolean;
  add(id: string): void;
  delete(id: string): boolean;
}

/**
 * A named slice of one shared store, so several "handled" sets can live in
 * it without their ids colliding.
 */
export function scopedSet(store: Set<string>, scope: string): HandledSet {
  const key = (id: string) => `${scope}\u0000${id}`;
  return {
    has: (id) => store.has(key(id)),
    add: (id) => void store.add(key(id)),
    delete: (id) => store.delete(key(id)),
  };
}

export interface RunState {
  handle: RunHandle;
  log: string;
  running: boolean;
  exitCode: number | null;
  prUrl: string | null;
  startedAt?: string;
}

export interface RunsApi {
  runs: Record<string, RunState>;
  /** Display history, including completed runs from previous sessions. */
  history: RunState[];
  track(handle: RunHandle): void;
  fail(runId: string, message: string): void;
  /**
   * Resolves with the exit code when this run ends.
   *
   * For sequences that must not overlap — pull, then merge, then check out —
   * where launching the next step before the last one finished would have two
   * git commands writing one repository.
   */
  completed(runId: string): Promise<number | null>;
  stop(runId: string): void;
  latestForProject(projectId: string): RunState | null;
  /**
   * Which finished runs have already been acted on, under `scope`.
   *
   * Kept here, beside the runs, rather than in each hook: the hooks live in
   * ProjectShell, which remounts on every project switch, and a fresh set
   * there sees every run of the session as new — so a finished bootstrap
   * bootstrapped again, a seed ran twice, a story moved back to Testing.
   */
  handled(scope: string): HandledSet;
}

/**
 * A HandledSet that outlives the component, for `const seen =
 * useHandled(runsApi, 'scope')` in place of `useRef(new Set())`.
 */
export function useHandled(runsApi: RunsApi, scope: string): { current: HandledSet } {
  const { handled } = runsApi;
  return useMemo(() => ({ current: handled(scope) }), [handled, scope]);
}

/** Tracks streamed output and exit status for every spawned run. */
export function useRuns(onRunFinished?: (run: RunState) => void): RunsApi {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [saved] = useState(loadRunHistory);
  const history = mergeHistory(saved, Object.values(runs));
  const savedSignature = useRef('');
  useEffect(() => {
    const signature = Object.values(runs)
      .filter((run) => !run.running)
      .map((run) => `${run.handle.runId}:${run.exitCode}:${run.log.length}`)
      .join('|');
    if (signature === savedSignature.current) return;
    savedSignature.current = signature;
    saveRunHistory(mergeHistory(saved, Object.values(runs)));
  }, [runs, saved]);
  /** Chunks waiting to be applied, by run, and the timer that applies them. */
  const pending = useRef(new Map<string, string[]>());
  const flushTimer = useRef<number | null>(null);
  const finishedCb = useRef(onRunFinished);
  useEffect(() => {
    finishedCb.current = onRunFinished;
  }, [onRunFinished]);

  useEffect(() => {
    // Output arrives a chunk at a time, and a chunk is small and frequent:
    // an agent or a docker build produces dozens a second. Setting state on
    // each one re-rendered every mounted tab — the app keeps them all
    // mounted — and rebuilt a 200,000 character string each time, which is
    // what made the whole window feel heavy while anything was running.
    //
    // So chunks are gathered and applied on a frame-ish interval. The log
    // still arrives in order and still ends up identical; it just stops
    // asking React about it sixty times a second.
    const flush = () => {
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      const batch = pending.current;
      if (batch.size === 0) return;
      pending.current = new Map();
      setRuns((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [runId, chunks] of batch) {
          const run = next[runId];
          if (!run) continue;
          changed = true;
          // Cap retained log size — follow-mode streams run indefinitely.
          next[runId] = { ...run, log: (run.log + chunks.join('')).slice(-200_000) };
        }
        return changed ? next : prev;
      });
    };

    const offOutput = window.mvpfy.onRunOutput((ev) => {
      const waiting = pending.current.get(ev.runId) ?? [];
      waiting.push(ev.chunk);
      pending.current.set(ev.runId, waiting);
      if (flushTimer.current === null) {
        flushTimer.current = window.setTimeout(flush, LOG_FLUSH_MS);
      }
    });
    const offExit = window.mvpfy.onRunExit((ev) => {
      // Before anything reads the log. The last chunks of a run carry the
      // things that are read off it when it ends — the pull request URL, a
      // codex thread id, the message that says a conversation was lost —
      // and leaving them in the buffer would silently lose all three.
      flush();
      finishedCodes.current.set(ev.runId, ev.code);
      const waiters = waiting.current.get(ev.runId);
      if (waiters) {
        waiting.current.delete(ev.runId);
        for (const resolve of waiters) resolve(ev.code);
      }
      setRuns((prev) => {
        const run = prev[ev.runId];
        if (!run) return prev;
        const finished: RunState = {
          ...run,
          running: false,
          exitCode: ev.code,
          prUrl:
            run.handle.kind === 'ship' || run.handle.kind === 'plan-story'
              ? extractPrUrl(run.log)
              : null,
        };
        queueMicrotask(() => finishedCb.current?.(finished));
        return { ...prev, [ev.runId]: finished };
      });
    });
    return () => {
      offOutput();
      offExit();
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
    };
  }, []);

  const track = useCallback((handle: RunHandle) => {
    setRuns((prev) => ({
      ...prev,
      [handle.runId]: {
        handle,
        log: '',
        running: true,
        exitCode: null,
        prUrl: null,
        startedAt: new Date().toISOString(),
      },
    }));
  }, []);

  // Resolved by the exit listener below; a run that has already finished
  // resolves at once, so a caller that arrives late is not left waiting.
  const waiting = useRef(new Map<string, Array<(code: number | null) => void>>());
  const finishedCodes = useRef(new Map<string, number | null>());
  const completed = useCallback((runId: string): Promise<number | null> => {
    if (finishedCodes.current.has(runId)) {
      return Promise.resolve(finishedCodes.current.get(runId) ?? null);
    }
    return new Promise((resolve) => {
      const list = waiting.current.get(runId) ?? [];
      list.push(resolve);
      waiting.current.set(runId, list);
    });
  }, []);

  const stop = useCallback((runId: string) => {
    void window.mvpfy.stopRun(runId);
  }, []);

  const fail = useCallback((runId: string, message: string) => {
    setRuns((prev) => {
      const run = prev[runId];
      if (!run) return prev;
      return {
        ...prev,
        [runId]: { ...run, running: false, exitCode: 1, log: run.log + message + '\n' },
      };
    });
  }, []);

  const latestForProject = useCallback(
    (projectId: string): RunState | null => {
      const forProject = Object.values(runs).filter((r) => r.handle.projectId === projectId);
      return forProject.length > 0 ? forProject[forProject.length - 1] : null;
    },
    [runs]
  );

  const handledStore = useRef(new Set<string>());
  const handled = useCallback((scope: string) => scopedSet(handledStore.current, scope), []);

  return { runs, history, track, fail, completed, stop, latestForProject, handled };
}
