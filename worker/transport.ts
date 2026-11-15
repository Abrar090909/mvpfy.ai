import { Execution, ProgressBody, ProgressResponse } from '../shared/runner/contract';

/**
 * Everything the worker says to Feature1 — which is two calls.
 *
 * The proposal this replaced had eight operations: register, heartbeat,
 * claim, progress, blocked, result, attach and release. Feature1 shipped
 * two, and it is the better design. There is no registration because a
 * credential is minted by an organisation admin out of band; there is no
 * separate heartbeat, blocked, result or release because all of them are a
 * progress call with a different body; and there is no attach because the
 * server attaches pull requests itself from the result, which is what keeps
 * ownership its decision rather than the worker's.
 */
export interface Feature1Transport {
  /** One execution or none. The server decides; there is no capacity hint. */
  claim(): Promise<Execution | null>;
  /**
   * Heartbeat, progress, repository result and terminal state, all one call.
   * An empty body is a heartbeat. The lease token travels in a header.
   */
  progress(
    executionId: string,
    leaseToken: string,
    body: ProgressBody
  ): Promise<ProgressResponse['execution']>;
}

/**
 * Try something that may have failed for a reason that will pass.
 *
 * `StaleAttemptError` is never retried: it means somebody else holds this
 * execution now, and retrying is how two workers both report on one.
 * `PermanentTransportError` is never retried either — the server understood
 * and said no, and a malformed result will be just as malformed next time.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  opts: {
    attempts?: number;
    /** Injected so tests need no clock. */
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (error: unknown, attempt: number) => void;
    /**
     * No retry starts after this long. Five attempts of up to 30 s each plus
     * the backoff came to about 157 s against a 180 s lease — so a run of
     * failures could outlast the lease it was trying to keep.
     */
    deadlineMs?: number;
    /** Injected so tests need no clock. */
    now?: () => number;
    /** Injected so tests are deterministic. */
    random?: () => number;
  } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const deadline = now() + (opts.deadlineMs ?? 90_000);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === 'StaleAttemptError' || name === 'PermanentTransportError') throw error;
      lastError = error;
      if (attempt === attempts) break;
      // Bounded well inside the three-minute lease: a backoff that outlasts
      // it would hand the execution to somebody else while we waited. Jittered,
      // so workers that failed together do not all come back at once.
      const delay = Math.min(20_000, 500 * 2 ** (attempt - 1)) * (0.5 + random() / 2);
      if (now() + delay >= deadline) break;
      opts.onRetry?.(error, attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}
