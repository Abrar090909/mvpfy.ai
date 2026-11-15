import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MvpfyState, Project } from '../../shared/types';
import { UpdateState, useProjectController } from '../hooks/useProjectController';
import { RunsApi, RunState } from '../lib/useRuns';
import AppView from './AppView';
import LogPanel from '../components/LogPanel';
import PlanActivityPanel from '../components/PlanActivityPanel';
import { parseUsage, shortCount, totalIn } from '../lib/usage';
import OverviewView from './OverviewView';
import PlanView from './PlanView';
import { RUN_LABELS } from '../lib/runLabels';
import {
  AppWindow,
  CodeXml,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  RotateCw,
  ScrollText,
  Square,
  SquareKanban,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ProjectTab = 'overview' | 'plan' | 'app' | 'code' | 'logs';

interface Props {
  project: Project;
  state: MvpfyState;
  updateState: UpdateState;
  runsApi: RunsApi;
  tab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
}

export default function ProjectShell({
  project,
  state,
  updateState,
  runsApi,
  tab,
  onTabChange,
}: Props) {
  const c = useProjectController(project, state, updateState, runsApi);
  const mvpfyYml = c.viewerFiles.find((f) => f.relativePath === 'mvpfy.yml')?.content ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ideWebview = useRef<any>(null);

  // Auto-follow container logs when the PM opens the Logs tab of a running
  // environment; stays running until stopped or the environment goes down.
  const appLogsActive = c.appLogsRun?.running === true;
  const working = c.runHistory.filter((r) => r.running && r.handle.kind !== 'app-logs').length;

  // Follows the newest run until the user picks one, then stays where they
  // put it — a log being read should not be swapped out underneath them.
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const shownRun =
    (pickedRunId && c.runHistory.find((r) => r.handle.runId === pickedRunId)) ||
    c.latestRun ||
    c.runHistory[c.runHistory.length - 1] ||
    null;
  useEffect(() => {
    if (tab === 'logs' && project.status === 'running' && !appLogsActive) {
      void c.startAppLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, project.status]);

  const tabs: Array<{ id: ProjectTab; label: string; icon: LucideIcon }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'plan', label: 'Plan', icon: SquareKanban },
    { id: 'app', label: 'App', icon: AppWindow },
    { id: 'code', label: 'Code', icon: CodeXml },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* An IDE tab strip: the open tab is the same colour as the work below it
          and joins it; the others sit back in the frame. Two full-width bars
          (a top bar, then a row of pill tabs) used to spend 128px on this. */}
      <nav
        aria-label="Project workspace"
        className="relative z-[15] flex h-11 shrink-0 items-stretch border-b border-line bg-chrome"
      >
        {tabs.map((t) => {
          const open = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              aria-current={open ? 'page' : undefined}
              onClick={() => onTabChange(t.id)}
              className={`relative flex items-center gap-2 border-r border-line px-4 text-[12.5px] ${
                open
                  ? 'bg-paper font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-paper'
                  : 'text-muted hover:bg-hoverfill/60 hover:text-ink'
              }`}
            >
              <Icon size={15} strokeWidth={1.6} aria-hidden />
              {t.label}
              {t.id === 'logs' && working > 0 && (
                <LoaderCircle
                  size={12}
                  className="spin text-work"
                  aria-label={`${working} running`}
                />
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 px-3">
          {tab === 'code' && c.ideUrl && (
            <>
              <button
                onClick={() => ideWebview.current?.reload?.()}
                className="btn-ghost h-7 px-2 text-[12px]"
              >
                <RotateCw size={13} aria-hidden />
                Reload
              </button>
              <button
                onClick={() => c.ideUrl && c.openExternal(c.ideUrl)}
                className="btn-ghost h-7 px-2 text-[12px]"
              >
                <ExternalLink size={13} aria-hidden />
                Open in browser
              </button>
              <button
                onClick={() => void c.stopIde()}
                disabled={c.busy}
                className="btn-ghost h-7 px-2 text-[12px] text-danger hover:text-danger-hover disabled:opacity-50"
              >
                <Square size={11} className="fill-current" aria-hidden />
                Stop editor
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="relative min-h-0 flex-1">
        {/* Overview and Logs are plain panes; App/Code hold persistent webviews.
            All stay mounted and stack by z-index — hiding a webview with
            display/visibility freezes its guest at the wrong size. */}
        <Pane active={tab === 'overview'} scroll>
          <OverviewView c={c} mvpfyYml={mvpfyYml} onOpenTab={(t) => onTabChange(t)} />
        </Pane>

        <Pane active={tab === 'plan'}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PlanView c={c} onOpenTab={(t) => onTabChange(t)} />
            </div>
            <PlanActivityPanel runs={c.runHistory} onStop={c.stopRun} />
          </div>
        </Pane>

        <Pane active={tab === 'app'}>
          <AppView c={c} onOpenOverview={() => onTabChange('overview')} />
        </Pane>

        <Pane active={tab === 'code'}>
          {c.ideUrl && c.ideHealthy ? (
            <div className="h-full p-4">
              <div className="h-full overflow-hidden rounded-[10px] border border-line bg-surface">
                <webview
                  ref={ideWebview}
                  src={c.ideUrl}
                  partition="persist:mvpfy-embedded"
                  style={{ display: 'flex', width: '100%', height: '100%' }}
                />
              </div>
            </div>
          ) : c.ideUrl || c.ideStarting ? (
            <Placeholder
              icon={LoaderCircle}
              title="Starting the editor…"
              body="First launch downloads the editor image (~300 MB)."
            />
          ) : c.ideError ? (
            /* A failed launch used to look exactly like one never attempted:
               the button came back and nothing said why. Docker's own words
               are what makes this reportable. */
            <div className="mx-auto flex h-full w-full max-w-[720px] flex-col justify-center px-8">
              <h2 className="text-[15px] font-semibold">The editor did not start</h2>
              <p className="mt-1 text-[13px] text-body">
                Docker could not run the editor container. Its output is below.
              </p>
              <pre className="mt-3 max-h-[280px] overflow-auto rounded-lg border border-line bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-body">
                {c.ideError}
              </pre>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => void c.startIde()}
                  disabled={c.busy}
                  className="btn-primary h-[34px] px-3.5 text-[13px] disabled:opacity-50"
                >
                  Try again
                </button>
                <span className="text-xs text-muted">
                  Docker Desktop needs to be running before the editor can start.
                </span>
              </div>
            </div>
          ) : (
            <Placeholder
              icon={CodeXml}
              title="Open the code in VS Code"
              body="Runs the open-source code-server editor in Docker with this project mounted — read and edit the code right here."
              action={{
                label: 'Launch editor',
                onClick: () => void c.startIde(),
                primary: true,
                disabled: c.busy,
              }}
            />
          )}
        </Pane>

        <Pane active={tab === 'logs'} scroll>
          <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-6 pb-16 pt-6">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span
                  className="section-label whitespace-nowrap"
                  title="Recent completed runs stay available when the app is stopped."
                >
                  Activity history
                </span>
                <ProjectUsage runs={c.runHistory} />
                {/* Every run is kept for the session. Showing only the newest
                    meant the log explaining a failure disappeared the moment
                    anything else ran — which is exactly when it is wanted. */}
                {c.runHistory.length > 0 && (
                  <select
                    aria-label="Choose a run from history"
                    value={shownRun?.handle.runId ?? ''}
                    onChange={(e) => setPickedRunId(e.target.value)}
                    className="h-7 max-w-[300px] shrink-0 rounded-md border border-line bg-surface px-2 text-[12px] text-body hover:border-line-strong"
                  >
                    {[...c.runHistory].reverse().map((run, i) => {
                      // Only agent runs report anything; docker and git say
                      // nothing, and "0 tokens" beside those reads as a
                      // measurement rather than an absence.
                      const used = parseUsage(run.log);
                      return (
                        <option key={run.handle.runId} value={run.handle.runId}>
                          {i === 0 ? 'Latest — ' : ''}
                          {RUN_LABELS[run.handle.kind] ?? run.handle.kind}
                          {run.startedAt ? ` · ${new Date(run.startedAt).toLocaleString()}` : ''}
                          {run.running
                            ? ' · running'
                            : run.exitCode === 0
                              ? ' · completed'
                              : ' · failed'}
                          {used.turns.length > 0
                            ? ` · ${shortCount(totalIn(used.total))} in / ${shortCount(used.total.output)} out`
                            : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
              <LogPanel run={shownRun} onStop={c.stopRun} heightClass="h-[400px]" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <span className="section-label whitespace-nowrap">App logs</span>
                <span className="truncate text-[11.5px] text-faint">
                  live, from the running containers
                </span>
                {project.status === 'running' && !appLogsActive && (
                  <button onClick={() => void c.startAppLogs()} className="ml-auto text-xs link">
                    Start streaming
                  </button>
                )}
              </div>
              {c.appLogsRun ? (
                <LogPanel
                  run={c.appLogsRun}
                  onStop={c.stopRun}
                  heightClass="h-[400px]"
                  title="app logs"
                />
              ) : (
                <div className="card px-5 py-6 text-[13px] text-muted">
                  {project.status === 'running'
                    ? 'Starting the log stream…'
                    : 'Start the environment to stream its logs here.'}
                </div>
              )}
            </div>
          </div>
        </Pane>
      </div>
    </div>
  );
}

function Pane({
  active,
  scroll,
  children,
}: {
  active: boolean;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!active}
      {...(!active ? { inert: '' } : {})}
      className={`absolute inset-0 ${scroll ? 'overflow-y-auto' : 'overflow-hidden'} bg-paper`}
      style={{ zIndex: active ? 2 : 0, pointerEvents: active ? 'auto' : 'none' }}
    >
      {children}
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      {Icon && (
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-card">
          <Icon size={20} strokeWidth={1.5} aria-hidden />
        </span>
      )}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 max-w-[420px] text-[13px] leading-normal text-body [text-wrap:pretty]">
        {body}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className={`${action.primary ? 'btn-primary' : 'btn-secondary'} mt-4 h-[34px] px-4 disabled:opacity-50`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * What every agent run in this project has consumed between them.
 *
 * The per-run figure answers "what did that cost"; this answers the question
 * somebody actually has, which is whether a subscription is going to last the
 * week. Only what is still in the history — runs age out of it — so it is a
 * recent total rather than a lifetime one, and it says so.
 */
function ProjectUsage({ runs }: { runs: RunState[] }) {
  const used = runs.map((r) => parseUsage(r.log)).filter((u) => u.turns.length > 0);
  if (used.length === 0) return null;
  const sent = used.reduce((n, u) => n + totalIn(u.total), 0);
  const cached = used.reduce((n, u) => n + u.total.cacheRead, 0);
  const wrote = used.reduce((n, u) => n + u.total.output, 0);
  const turns = used.reduce((n, u) => n + u.turns.length, 0);
  return (
    <span
      title={
        `${used.length} agent run${used.length === 1 ? '' : 's'} in this history\n` +
        `${turns} turn${turns === 1 ? '' : 's'}\n` +
        `sent ${sent.toLocaleString()} tokens, ${cached.toLocaleString()} of them from cache\n` +
        `wrote ${wrote.toLocaleString()}`
      }
      className="ml-auto truncate font-mono text-[11px] text-muted"
    >
      {used.length} agent runs · {shortCount(sent)} in
      {cached > 0 && ` (${shortCount(cached)} cached)`} · {shortCount(wrote)} out
    </span>
  );
}
