import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CliStatus,
  MvpfyState,
  Project,
  RELEASES_URL,
  UpdateStatus,
  macInstallerUrl,
} from '../shared/types';
import { checkClis } from './lib/cliCheck';
import { loadState, saveState } from './lib/state';
import { RunState, useRuns } from './lib/useRuns';
import AddProjectView from './views/AddProjectView';
import {
  loadConnectNudgeDismissedAt,
  saveConnectNudgeDismissedAt,
  shouldShowConnectNudge,
} from './lib/connectNudge';
import ConnectFeature1Banner from './views/ConnectFeature1Banner';
import ProjectShell, { ProjectTab } from './views/ProjectShell';
import SettingsView from './views/SettingsView';
import Sidebar from './views/Sidebar';
import StatusBar from './views/StatusBar';
import { toggledTheme, useTheme } from './lib/theme';

type Screen = 'project' | 'settings' | 'add';

export default function App() {
  const [state, setState] = useState<MvpfyState | null>(null);
  const [cliStatuses, setCliStatuses] = useState<CliStatus[]>([]);
  const [screen, setScreen] = useState<Screen>('project');
  // Settings opened from the connect nudge scrolls to the Feature1 card.
  const [settingsFocus, setSettingsFocus] = useState<'feature1' | null>(null);
  const [nudgeDismissedAt, setNudgeDismissedAt] = useState<string | null>(() =>
    loadConnectNudgeDismissedAt()
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [tabByProject, setTabByProject] = useState<Record<string, ProjectTab>>({});
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  // Read once: the running build cannot change under us without a restart.
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    void window.mvpfy.appVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    return window.mvpfy.onUpdateStatus((status) => {
      if (status.kind !== 'error') setUpdateStatus(status);
    });
  }, []);

  const updateState = useCallback((mutate: (prev: MvpfyState) => MvpfyState) => {
    setState((prev) => (prev ? mutate(prev) : prev));
  }, []);

  // Saved once per committed change, from here rather than inside the updater:
  // an updater may run twice (StrictMode does exactly that), and one that
  // returned the state unchanged still wrote the whole file — synchronously,
  // on the main process, in the way of every log line behind it.
  const loadedState = useRef<MvpfyState | null>(null);
  useEffect(() => {
    if (!state || state === loadedState.current) return;
    void saveState(state);
  }, [state]);

  const onRunFinished = useCallback(
    (run: RunState) => {
      const { kind, projectId, storyId } = run.handle;
      updateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => {
          if (p.id !== projectId) return p;
          const patch: Partial<Project> = {};
          if (kind === 'bootstrap' && run.exitCode === 0) {
            patch.status = 'needs-review';
            // Whatever was waiting to be added has now been. Cleared only
            // on success: a setup that failed leaves the repositories
            // pending, so the offer to add them is still there.
            patch.reposPendingSetup = [];
          }
          if (kind === 'docker-up' && run.exitCode === 0) patch.status = 'running';
          if (kind === 'docker-down' && run.exitCode === 0) patch.status = 'stopped';
          if (kind === 'ship' && storyId) patch.lastStoryId = storyId;
          if (kind === 'ide-up') {
            patch.idePort = run.exitCode === 0 ? (run.handle.port ?? null) : null;
          }
          if (kind === 'ide-down' && run.exitCode === 0) patch.idePort = null;
          // A failed task-list run never chains into the work, so it has to
          // surface here — otherwise the project sits in 'bootstrapping'.
          if (
            run.exitCode !== 0 &&
            (kind === 'docker-up' || kind === 'bootstrap' || kind === 'bootstrap-plan')
          ) {
            patch.status = 'error';
          }
          return { ...p, ...patch };
        }),
      }));
    },
    [updateState]
  );

  const runsApi = useRuns(onRunFinished);
  useTheme(state?.settings.theme);

  const refreshClis = useCallback(() => {
    void checkClis().then(setCliStatuses);
  }, []);

  useEffect(() => {
    void loadState().then((s) => {
      loadedState.current = s; // what is on disk already; no need to write it back
      setState(s);
      setActiveProjectId(s.projects[0]?.id ?? null);
      if (s.projects.length === 0) setScreen('add');
    });
    refreshClis();
  }, [refreshClis]);

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center bg-paper text-muted">Loading…</div>
    );
  }

  const activeProject =
    state.projects.find((p) => p.id === activeProjectId) ?? state.projects[0] ?? null;
  const tab: ProjectTab = activeProject
    ? (tabByProject[activeProject.id] ?? 'overview')
    : 'overview';

  return (
    <div className="flex h-full bg-paper text-ink">
      <Sidebar
        projects={state.projects}
        activeProjectId={activeProject?.id ?? null}
        screen={screen}
        runs={runsApi.runs}
        tenantConnected={Boolean(state.tenant?.tokenKeychainEntry)}
        tenantSlug={state.tenant?.slug ?? null}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setScreen('project');
        }}
        onAddProject={() => setScreen('add')}
        onOpenSettings={() => {
          setSettingsFocus(null);
          setScreen('settings');
        }}
        theme={state.settings.theme}
        onToggleTheme={() =>
          updateState((prev) => ({
            ...prev,
            settings: { ...prev.settings, theme: toggledTheme(prev.settings.theme) },
          }))
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {screen === 'project' &&
          activeProject &&
          shouldShowConnectNudge(state, nudgeDismissedAt) && (
            <ConnectFeature1Banner
              onConnect={() => {
                setSettingsFocus('feature1');
                setScreen('settings');
              }}
              onDismiss={() => {
                const now = new Date();
                saveConnectNudgeDismissedAt(now);
                setNudgeDismissedAt(now.toISOString());
              }}
            />
          )}

        {/*
          The project stays mounted under Settings and Add, covered rather than
          unmounted. Unmounting it threw away everything its hooks remember for
          the session — the implement-all chain, the queue, a quota wait — so a
          look at Settings mid-run quietly stopped the work. Covered the same way
          ProjectShell stacks its own panes, so the embedded webviews are never
          hidden with display:none. The cover sits above the project's own tab
          strip: below it, the strip showed through, still marking a tab as open
          on top of Settings.
        */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {activeProject && (
            <div
              className="flex min-h-0 flex-1 flex-col"
              aria-hidden={screen !== 'project'}
              {...(screen !== 'project' ? { inert: '' } : {})}
            >
              <ProjectShell
                key={activeProject.id}
                project={activeProject}
                state={state}
                updateState={updateState}
                runsApi={runsApi}
                tab={tab}
                onTabChange={(t) => setTabByProject((prev) => ({ ...prev, [activeProject.id]: t }))}
              />
            </div>
          )}
          {screen === 'settings' ? (
            <div className="absolute inset-0 z-30 overflow-y-auto bg-paper">
              <SettingsView
                version={appVersion}
                state={state}
                cliStatuses={cliStatuses}
                onRefreshClis={refreshClis}
                updateState={updateState}
                focus={settingsFocus}
              />
            </div>
          ) : screen === 'add' || !activeProject ? (
            <div className="absolute inset-0 z-30 overflow-y-auto bg-paper">
              <AddProjectView
                state={state}
                updateState={updateState}
                onCreated={(id) => {
                  setActiveProjectId(id);
                  setScreen('project');
                }}
              />
            </div>
          ) : null}
        </div>

        <StatusBar
          project={activeProject}
          runs={runsApi.runs}
          version={appVersion}
          update={updateStatus}
          onInstallUpdate={() => void window.mvpfy.installUpdate()}
          onDownloadUpdate={() =>
            void window.mvpfy.openExternal(
              updateStatus?.version ? macInstallerUrl(updateStatus.version) : RELEASES_URL
            )
          }
        />
      </div>
    </div>
  );
}
