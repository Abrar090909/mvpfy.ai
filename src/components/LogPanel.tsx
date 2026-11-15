import { useEffect, useMemo, useRef, useState } from 'react';
import { formatLog } from '../lib/logFormat';
import { parseUsage, shortCount, totalIn } from '../lib/usage';
import type { TurnUsage } from '../lib/usage';
import type { RunState } from '../lib/useRuns';
import { CircleCheck, CircleX, LoaderCircle, Square } from 'lucide-react';

interface Props {
  run: RunState | null;
  onStop: (runId: string) => void;
  /** Tailwind height class for the panel; defaults to h-64. */
  heightClass?: string;
  /** Panel title override (defaults to the run kind). */
  title?: string;
}

export default function LogPanel({ run, onStop, heightClass = 'h-64', title }: Props) {
  const scrollRef = useRef<HTMLPreElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showTurns, setShowTurns] = useState(false);
  // Following the end of the log until somebody scrolls up to read, then
  // leaving them where they are until they come back down. It used to jump to
  // the bottom on every flush, so a live run could not be read back at all.
  const following = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const log = run?.log ?? '';
  // Formatting parses every JSON line of up to 200 KB, so it is done when the
  // log changes, not on every render of whatever contains this panel.
  const display = useMemo(() => (showRaw ? log : formatLog(log)), [log, showRaw]);

  // A different run starts at its end, wherever the last one was left.
  const runId = run?.handle.runId;
  useEffect(() => {
    following.current = true;
  }, [runId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [display, runId]);

  // Agent runs report what they consumed as they go, per turn. Every other
  // kind of run — docker, git, an installer — reports nothing, and a row of
  // zeroes beside those would be noise rather than information.
  const usage = run ? parseUsage(run.log) : null;
  const spent = usage && usage.turns.length > 0 ? usage : null;

  return (
    <div
      className={`flex ${heightClass} flex-col overflow-hidden rounded-xl border border-line bg-sunken`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-chrome px-3">
        <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
          {run ? (
            <>
              {run.running ? (
                <LoaderCircle size={14} className="spin shrink-0 text-work" aria-hidden />
              ) : run.exitCode === 0 ? (
                <CircleCheck size={14} className="shrink-0 text-go" aria-hidden />
              ) : (
                <CircleX size={14} className="shrink-0 text-danger" aria-hidden />
              )}
              <span className="truncate font-medium text-ink">{title ?? run.handle.kind}</span>
              {run.handle.storyId && (
                <span className="shrink-0 font-mono text-[11.5px] text-muted">
                  {run.handle.storyId}
                </span>
              )}
              <span
                className={`shrink-0 font-mono text-[11.5px] ${
                  run.running ? 'text-work' : run.exitCode === 0 ? 'text-go' : 'text-danger'
                }`}
              >
                {run.running ? 'running' : `exit ${run.exitCode ?? 'killed'}`}
              </span>
            </>
          ) : (
            <span className="text-muted">No saved runs yet</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {spent && (
            <button
              onClick={() => setShowTurns((v) => !v)}
              aria-expanded={showTurns}
              title={
                `${spent.turns.length} turn${spent.turns.length === 1 ? '' : 's'}\n` +
                `sent ${totalIn(spent.total).toLocaleString()} tokens ` +
                `(${spent.total.cacheRead.toLocaleString()} from cache)\n` +
                `wrote ${spent.total.output.toLocaleString()} tokens`
              }
              className={`h-6 rounded-md px-1.5 font-mono text-[11px] ${
                showTurns ? 'bg-raised text-ink' : 'text-muted hover:bg-hoverfill hover:text-ink'
              }`}
            >
              {spent.turns.length} turn{spent.turns.length === 1 ? '' : 's'} ·{' '}
              {shortCount(totalIn(spent.total))} in
              {/* Cache is usually most of it — a run reading 40k of context
                  it has already sent is not consuming 40k again, and the
                  unqualified number reads as though it were. */}
              {spent.total.cacheRead > 0 && ` (${shortCount(spent.total.cacheRead)} cached)`} ·{' '}
              {shortCount(spent.total.output)} out
            </button>
          )}
          {run && (
            <button
              onClick={() => setShowRaw((v) => !v)}
              aria-pressed={showRaw}
              className="btn-ghost h-6 px-2 text-[11.5px]"
            >
              {showRaw ? 'Pretty' : 'Raw'}
            </button>
          )}
          {run?.running && (
            <button
              onClick={() => onStop(run.handle.runId)}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-danger-border px-2 text-[11.5px] text-danger hover:bg-danger-bg"
            >
              <Square size={10} className="fill-current" aria-hidden />
              Stop
            </button>
          )}
        </div>
      </div>
      {spent && showTurns && <TurnStrip turns={spent.turns} />}
      <pre
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-[1.65] text-body"
      >
        {display ||
          (run?.running
            ? 'Waiting for output…'
            : run
              ? 'This run produced no readable output. Select Raw to inspect the original events.'
              : 'Completed runs will appear here. No task needs to be running to read saved logs.')}
      </pre>
    </div>
  );
}

/**
 * Every turn of a run, as one bar each.
 *
 * The total answers what a run consumed; this answers where it went — a long
 * run is rarely flat, and one turn that reads the whole repository dwarfing
 * twenty small ones is the shape worth seeing. Bars rather than a table
 * because the question is which one is tall, not what each number was, and the
 * numbers are on the bar anyway.
 */
function TurnStrip({ turns }: { turns: TurnUsage[] }) {
  // Scaled to the biggest turn rather than to an absolute ceiling: the
  // interesting thing is the proportion between them, and a fixed scale makes
  // a whole run of small turns look like a flat line.
  const peak = Math.max(...turns.map((t) => totalIn(t) + t.output), 1);
  return (
    <div className="flex items-end gap-[2px] overflow-x-auto border-b border-line bg-chrome px-3 py-2">
      {turns.map((t, i) => {
        const size = totalIn(t) + t.output;
        return (
          <div
            key={i}
            title={
              `turn ${i + 1} of ${turns.length}\n` +
              `sent ${totalIn(t).toLocaleString()}` +
              (t.cacheRead > 0 ? ` (${t.cacheRead.toLocaleString()} cached)` : '') +
              `\nwrote ${t.output.toLocaleString()}`
            }
            className="flex h-10 w-[7px] shrink-0 cursor-default flex-col justify-end"
          >
            {/* Written tokens on top of sent, so a turn that read a great deal
                and wrote little reads differently from one that did the
                reverse — they cost differently and mean different things. */}
            <div
              className="w-full rounded-t-[1px] bg-go"
              style={{ height: `${Math.max((t.output / peak) * 100, size > 0 ? 2 : 0)}%` }}
            />
            <div
              className="w-full bg-line-strong"
              style={{ height: `${(totalIn(t) / peak) * 100}%` }}
            />
          </div>
        );
      })}
      <span className="ml-2 shrink-0 self-center font-mono text-[10px] text-faint">
        each bar one turn · grey sent, green written
      </span>
    </div>
  );
}
