import { Folder, LoaderCircle, Moon, Plug, Plus, Settings, Sun } from 'lucide-react';
import { Project, resolveTheme, ThemeChoice } from '../../shared/types';
import Logo from '../components/Logo';
import { runLabel } from '../lib/runLabels';
import type { RunState } from '../lib/useRuns';

interface Props {
  projects: Project[];
  activeProjectId: string | null;
  /** What the main area is showing; a project is only "selected" on 'project'. */
  screen: 'project' | 'settings' | 'add';
  runs: Record<string, RunState>;
  tenantConnected: boolean;
  tenantSlug: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
  theme: ThemeChoice | undefined;
  onToggleTheme: () => void;
}

/**
 * The project list, as the workspace sidebar of an agent IDE: every project
 * at once, with what it is doing right now, one click from any other.
 *
 * It replaces a top bar whose project switcher was a dropdown — the state of
 * every other project was invisible until it was opened, and an agent finishing
 * in one project said nothing anywhere else.
 */
export default function Sidebar({
  projects,
  activeProjectId,
  screen,
  runs,
  tenantConnected,
  tenantSlug,
  onSelectProject,
  onAddProject,
  onOpenSettings,
  theme,
  onToggleTheme,
}: Props) {
  const showingLight =
    resolveTheme(theme, window.matchMedia('(prefers-color-scheme: light)').matches) === 'light';
  const working = (projectId: string) =>
    Object.values(runs).filter(
      (r) => r.running && r.handle.projectId === projectId && r.handle.kind !== 'app-logs'
    );

  return (
    <aside
      aria-label="Projects"
      className="flex w-[248px] shrink-0 flex-col border-r border-line bg-chrome"
    >
      <div className="flex h-12 shrink-0 items-center px-4">
        <Logo />
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="section-label">Projects</span>
        <button
          onClick={onAddProject}
          aria-label="Add project"
          title="Add project"
          className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-hoverfill hover:text-ink ${
            screen === 'add' ? 'bg-raised text-ink' : 'text-muted'
          }`}
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.length === 0 && (
          <button
            onClick={onAddProject}
            className="mx-1 mt-1 w-[calc(100%-8px)] rounded-lg border border-dashed border-line px-3 py-4 text-left text-[12.5px] text-muted hover:border-line-strong hover:text-ink"
          >
            Add your first project
          </button>
        )}
        <ul className="flex flex-col gap-0.5">
          {projects.map((p) => {
            const selected = screen === 'project' && p.id === activeProjectId;
            const active = working(p.id);
            const latest = active[active.length - 1];
            return (
              <li key={p.id}>
                <button
                  onClick={() => onSelectProject(p.id)}
                  aria-current={selected ? 'page' : undefined}
                  title={p.localPath}
                  className={`group w-full rounded-lg border px-2.5 py-2 text-left ${
                    selected
                      ? 'border-line-strong bg-raised'
                      : 'border-transparent hover:bg-hoverfill'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Folder
                      size={15}
                      strokeWidth={1.6}
                      className={selected ? 'shrink-0 text-ink' : 'shrink-0 text-muted'}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                        selected ? 'text-ink' : 'text-body group-hover:text-ink'
                      }`}
                    >
                      {projectName(p)}
                    </span>
                    <StatusPill project={p} />
                  </span>
                  {latest && (
                    <span className="mt-1.5 flex items-center gap-1.5 pl-[23px] text-[11.5px] text-muted">
                      <LoaderCircle size={11} className="spin shrink-0 text-work" aria-hidden />
                      <span className="truncate">{runLabel(latest.handle.kind)}</span>
                      {latest.handle.storyId && (
                        <span className="shrink-0 font-mono text-[10.5px] text-faint">
                          {latest.handle.storyId}
                        </span>
                      )}
                      {active.length > 1 && (
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">
                          +{active.length - 1}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-body hover:bg-hoverfill hover:text-ink"
        >
          <Plug size={15} strokeWidth={1.6} className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {tenantConnected ? (
              <>
                Feature1 <span className="font-mono text-[11.5px] text-muted">{tenantSlug}</span>
              </>
            ) : (
              'Connect Feature1'
            )}
          </span>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${tenantConnected ? 'bg-go' : 'bg-dot-idle'}`}
            aria-label={tenantConnected ? 'connected' : 'not connected'}
          />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            aria-current={screen === 'settings' ? 'page' : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-hoverfill hover:text-ink ${
              screen === 'settings' ? 'bg-raised text-ink' : 'text-body'
            }`}
          >
            <Settings size={15} strokeWidth={1.6} className="shrink-0 text-muted" aria-hidden />
            Settings
          </button>
          <button
            onClick={onToggleTheme}
            aria-label={showingLight ? 'Switch to dark mode' : 'Switch to light mode'}
            title={showingLight ? 'Switch to dark mode' : 'Switch to light mode'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hoverfill hover:text-ink"
          >
            {showingLight ? (
              <Moon size={15} strokeWidth={1.6} aria-hidden />
            ) : (
              <Sun size={15} strokeWidth={1.6} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function projectName(p: Project): string {
  return p.localPath.split(/[\\/]/).pop() || p.id;
}

/** The one word that says where a project stands, with the port when it has one. */
function StatusPill({ project }: { project: Project }) {
  const { status } = project;
  if (status === 'running') {
    return (
      <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-go">
        <span className="h-1.5 w-1.5 rounded-full bg-go" />:{project.basePort}
      </span>
    );
  }
  if (status === 'error') {
    return <span className="shrink-0 font-mono text-[10.5px] text-danger">error</span>;
  }
  if (status === 'bootstrapping' || status === 'queued') {
    return <span className="shrink-0 font-mono text-[10.5px] text-work">setting up</span>;
  }
  return null;
}
