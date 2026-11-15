import { ChildProcess } from 'node:child_process';
import { RunExitEvent, RunOutputEvent } from '../../shared/types';
import { spawnEnv } from './docker';
import { killProcessTree, killProcessTrees, spawnShell } from './shell';

/**
 * Streaming command runner. Decoupled from the window via an injected event
 * sink (dependency inversion) so this service has no Electron UI imports.
 */

export interface RunEventSink {
  output(ev: RunOutputEvent): void;
  exit(ev: RunExitEvent): void;
}

let sink: RunEventSink = { output: () => {}, exit: () => {} };
const activeRuns = new Map<string, ChildProcess>();

export function setRunEventSink(next: RunEventSink): void {
  sink = next;
}

/**
 * `onExit` runs once when the process is gone, however it ended. Callers use
 * it to delete per-run scratch files — some of which hold credentials.
 *
 * `extraEnv` is merged over the run environment. Prefer it to a `VAR=value`
 * prefix on the command: that syntax is POSIX-only, and it would also print
 * the value into the run log along with the command.
 */
export function startRun(
  runId: string,
  command: string,
  cwd: string,
  onExit?: (code: number | null) => void,
  extraEnv?: NodeJS.ProcessEnv
): void {
  if (activeRuns.has(runId)) {
    throw new Error(`Run ${runId} is already active`);
  }
  let cleaned = false;
  const cleanup = (code: number | null) => {
    if (cleaned) return;
    cleaned = true;
    try {
      onExit?.(code);
    } catch {
      // Cleanup is best effort; the startup sweep is the backstop.
    }
  };
  sink.output({ runId, stream: 'info', chunk: `$ ${command}\n` });
  const child = spawnShell(command, { cwd, env: { ...spawnEnv(), ...extraEnv } });
  activeRuns.set(runId, child);

  const output = batchedOutput(runId, (ev) => sink.output(ev));
  child.stdout?.on('data', (data: Buffer) => output.push('stdout', data.toString('utf8')));
  child.stderr?.on('data', (data: Buffer) => output.push('stderr', data.toString('utf8')));
  // Every way a run can end has to emit an exit, exactly once. A shell that
  // cannot be spawned used to report the error and stop there, so anything
  // awaiting the run waited for an event that was never coming — and a caller
  // that blocks on completion leaves the run marked as still going, which
  // disables the whole project until the app is restarted.
  let exited = false;
  const finish = (code: number | null) => {
    if (exited) return;
    exited = true;
    // Everything the run printed reaches the renderer before its exit does:
    // the last lines carry the PR URL and the codex thread id.
    output.flush();
    activeRuns.delete(runId);
    cleanup(code);
    sink.exit({ runId, code });
  };
  child.on('error', (err) => {
    output.flush();
    sink.output({ runId, stream: 'stderr', chunk: `spawn error: ${err.message}\n` });
    finish(null);
  });
  child.on('close', (code) => finish(code));
}

/** How long output is gathered before it crosses to the renderer. */
export const OUTPUT_BATCH_MS = 33;

/**
 * Output for one run, sent in batches rather than one IPC message per chunk.
 *
 * An agent streaming JSON or `docker logs -f` produces chunks by the hundred
 * a second, and each was its own message across the process boundary. The
 * order is kept exactly — adjacent chunks of the same stream are joined, a
 * switch between stdout and stderr starts a new message — so the log reads
 * the same; it just arrives in a few dozen messages a second at most.
 */
export function batchedOutput(
  runId: string,
  emit: (ev: RunOutputEvent) => void,
  delayMs: number = OUTPUT_BATCH_MS
): { push(stream: 'stdout' | 'stderr', chunk: string): void; flush(): void } {
  let pending: Array<{ stream: 'stdout' | 'stderr'; chunk: string }> = [];
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = pending;
    pending = [];
    for (const { stream, chunk } of batch) emit({ runId, stream, chunk });
  };
  return {
    push(stream, chunk) {
      const last = pending[pending.length - 1];
      if (last && last.stream === stream) last.chunk += chunk;
      else pending.push({ stream, chunk });
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}

export function stopRun(runId: string): void {
  killProcessTree(activeRuns.get(runId));
}

export function stopAllRuns(): void {
  killProcessTrees([...activeRuns.values()]);
}
