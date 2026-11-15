import { ArrowUpCircle, LoaderCircle } from 'lucide-react';
import { Project, UpdateStatus } from '../../shared/types';
import type { RunState } from '../lib/useRuns';
import { projectName } from './Sidebar';

interface Props {
  project: Project | null;
  runs: Record<string, RunState>;
  version: string;
  update: UpdateStatus | null;
  onInstallUpdate: () => void;
  onDownloadUpdate: () => void;
}

/**
 * The strip along the bottom: where the open project stands, how many agents
 * are working across every project, and the build — the facts worth having
 * in view while doing something else.
 *
 * The update offer lives here too. It used to float over the bottom-right of
 * whatever was open, covering buttons, until dismissed.
 */
export default function StatusBar({
  project,
  runs,
  version,
  update,
  onInstallUpdate,
  onDownloadUpdate,
}: Props) {
  const working = Object.values(runs).filter((r) => r.running && r.handle.kind !== 'app-logs');
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-chrome px-3 font-mono text-[11px] text-muted">
      {project && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              project.status === 'running'
                ? 'bg-go'
                : project.status === 'error'
                  ? 'bg-danger'
                  : 'bg-dot-idle'
            }`}
          />
          <span className="truncate text-body">{projectName(project)}</span>
          <span className="shrink-0">
            {project.status === 'running'
              ? `running · localhost:${project.basePort}`
              : project.status === 'error'
                ? 'needs attention'
                : project.status === 'stopped'
                  ? 'stopped'
                  : project.status === 'cloned'
                    ? 'not set up'
                    : project.status === 'needs-review'
                      ? 'set up · not started'
                      : 'setting up'}
          </span>
        </span>
      )}
      {working.length > 0 && (
        <span className="flex shrink-0 items-center gap-1.5 text-work">
          <LoaderCircle size={11} className="spin" aria-hidden />
          {working.length} {working.length === 1 ? 'task' : 'tasks'} running
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {update?.kind === 'downloaded' && (
          <button
            onClick={onInstallUpdate}
            className="flex items-center gap-1 text-ink hover:underline"
          >
            <ArrowUpCircle size={12} aria-hidden />
            {update.version} ready — restart to update
          </button>
        )}
        {update?.kind === 'available' && (
          <button
            onClick={onDownloadUpdate}
            className="flex items-center gap-1 text-ink hover:underline"
          >
            <ArrowUpCircle size={12} aria-hidden />
            {update.version} available
          </button>
        )}
        {version && <span className="text-faint">v{version}</span>}
      </span>
    </footer>
  );
}
