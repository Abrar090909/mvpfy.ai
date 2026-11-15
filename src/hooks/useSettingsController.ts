import { useEffect, useRef, useState } from 'react';
import {
  AgentKind,
  CliName,
  CliStatus,
  InstallPlan,
  MvpfyState,
  UpdateStatus,
} from '../../shared/types';
import { UpdateState } from './useProjectController';
import { CLI_HELP, cliRequired } from '../lib/cliCheck';
import { useFeature1Login } from './useFeature1Login';
import { startInstallToolsRun } from '../lib/agentRunner';

let runSeq = 0;
function nextRunId(kind: string, tool: string): string {
  return `cli-${kind}-${tool}-${++runSeq}`;
}

/**
 * Settings' behaviour: the tool checklist's installs and sign-ins, the update
 * check, the models each agent offers. Kept out of SettingsView, which only
 * lays it out — the same split as the project views and their controller,
 * and the repository's rule that components never call window.mvpfy.
 */
export function useSettingsController(
  state: MvpfyState,
  cliStatuses: CliStatus[],
  onRefreshClis: () => void,
  updateState: UpdateState
) {
  const login = useFeature1Login(state, updateState);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);

  // An update that finishes downloading while Settings is open should change
  // the button under the user, not wait for them to ask again. Only progress
  // is taken from the launch check — its failures are nobody's question yet,
  // and an offline start would otherwise greet them with an error they never
  // asked for.
  useEffect(
    () =>
      window.mvpfy.onUpdateStatus((status) => {
        if (status.kind === 'available' || status.kind === 'downloaded') setUpdate(status);
      }),
    []
  );

  const updateLine = checking
    ? 'Checking for a newer version…'
    : update?.kind === 'downloaded'
      ? `Version ${update.version ?? ''} is downloaded — it installs when you quit mvpfy.`
      : update?.kind === 'available'
        ? `Version ${update.version ?? ''} is available.`
        : update?.kind === 'none'
          ? 'This is the newest version.'
          : update?.kind === 'unsupported'
            ? 'Development builds do not update themselves.'
            : update?.kind === 'error'
              ? `Could not check for updates — ${update.message ?? 'the update server did not answer'}.`
              : 'mvpfy updates itself; this is the build you are running now.';

  const gh = cliStatuses.find((s) => s.name === 'gh');
  const [toolRun, setToolRun] = useState<{
    kind: 'login' | 'install';
    tool: string;
    runId: string;
  } | null>(null);
  const [toolLog, setToolLog] = useState('');
  // The finished run's output, kept after the run clears so the agent can be
  // handed what actually failed rather than being asked to guess.
  const [lastInstallLog, setLastInstallLog] = useState('');
  const [plans, setPlans] = useState<InstallPlan[]>([]);
  // Not in REQUIRED_CLIS — nothing but sharing wants it, so it must never read
  // as a missing requirement. Asked for separately for the same reason.
  const [hasTunnel, setHasTunnel] = useState(true);
  const planFor = (tool: string) => plans.find((p) => p.tool === tool) ?? null;
  const brewPlan = planFor('brew');

  // Installing one tool changes what the others need (Homebrew unlocks gh,
  // Docker and Node), so the plans are recomputed whenever the checklist is.
  useEffect(() => {
    void window.mvpfy.installPlans().then(setPlans);
    void window.mvpfy
      .canShare()
      .then(setHasTunnel)
      .catch(() => setHasTunnel(true));
  }, [cliStatuses]);

  // The models come from the installed CLIs, so they are re-read whenever the
  // checklist is — installing or updating an agent can change the list.
  const [models, setModels] = useState<Record<AgentKind, string[]>>({ claude: [], codex: [] });
  useEffect(() => {
    void Promise.all([window.mvpfy.agentModels('claude'), window.mvpfy.agentModels('codex')]).then(
      ([claude, codex]) => setModels({ claude, codex })
    );
  }, [cliStatuses]);

  // Stream sign-in and install output: device codes, URLs and progress bars
  // all matter to the person watching.
  // The log is read at exit through a ref, so the listeners are attached once
  // per run rather than torn down and re-attached on every chunk of output.
  const toolLogNow = useRef('');
  useEffect(() => {
    toolLogNow.current = toolLog;
  }, [toolLog]);
  useEffect(() => {
    if (!toolRun) return;
    const offOut = window.mvpfy.onRunOutput((ev) => {
      if (ev.runId === toolRun.runId) setToolLog((prev) => (prev + ev.chunk).slice(-4000));
    });
    const offExit = window.mvpfy.onRunExit((ev) => {
      if (ev.runId === toolRun.runId) {
        if (toolRun.kind === 'install') setLastInstallLog(toolLogNow.current);
        setToolRun(null);
        setToolLog('');
        onRefreshClis();
      }
    });
    return () => {
      offOut();
      offExit();
    };
  }, [toolRun, onRefreshClis]);

  function signIn(tool: string) {
    const runId = nextRunId('login', tool);
    setToolLog('');
    setToolRun({ kind: 'login', tool, runId });
    void window.mvpfy.cliLogin(runId, tool).catch(() => setToolRun(null));
  }

  function install(tool: string) {
    const runId = nextRunId('install', tool);
    setToolLog('');
    setToolRun({ kind: 'install', tool, runId });
    void window.mvpfy.installTool(runId, tool).catch(() => setToolRun(null));
  }

  // Everything missing that installs without a password, in one run. The ones
  // that need their own window are listed underneath instead: each has to be
  // started by the person who can type the password.
  const missingTools = cliStatuses
    .filter((c) => !c.found && cliRequired(c.name, state.settings.defaultAgent))
    .map((c) => c.name as string);
  const installableNow = missingTools.filter(
    (t) => planFor(t)?.available && planFor(t)?.mode === 'in-app'
  );
  const needOwnWindow = missingTools.filter(
    (t) => planFor(t)?.available && planFor(t)?.mode === 'terminal'
  );
  // Asking the agent to install the agent is not an answer, so this is only
  // offered once one of them is actually on the machine.
  const agentPresent = cliStatuses.some(
    (c) => (c.name === 'claude' || c.name === 'codex') && c.found
  );

  // Installed but not signed in is the other half of not working: gh without
  // a sign-in fails at the push, mid-run, having looked fine in the checklist.
  const needsSignIn = cliStatuses
    .filter(
      (c) =>
        c.found &&
        c.authenticated === false &&
        CLI_HELP[c.name].inAppLogin &&
        cliRequired(c.name, state.settings.defaultAgent)
    )
    .map((c) => c.name as string);
  // A sign-in that opens its own window has to be started by the person who
  // will answer it — three windows at once, in no stated order, is worse.
  const signInStreams = needsSignIn.filter((t) => !CLI_HELP[t as CliName].loginInTerminal);

  function signInAll() {
    if (signInStreams.length === 0) return;
    const runId = nextRunId('login', 'all');
    setToolLog('');
    setToolRun({ kind: 'login', tool: 'all', runId });
    void window.mvpfy.signInAll(runId, signInStreams).catch(() => setToolRun(null));
  }

  function installAll() {
    if (installableNow.length === 0) return;
    const runId = nextRunId('install', 'all');
    setLastInstallLog('');
    setToolLog('');
    setToolRun({ kind: 'install', tool: 'all', runId });
    void window.mvpfy.installAll(runId, installableNow).catch(() => setToolRun(null));
  }

  function askAgentToInstall() {
    if (missingTools.length === 0 || !agentPresent) return;
    setToolLog('');
    void startInstallToolsRun(state.settings, missingTools, lastInstallLog)
      .then((handle) => setToolRun({ kind: 'install', tool: 'agent', runId: handle.runId }))
      .catch(() => setToolRun(null));
  }

  const checkForUpdates = () => {
    setChecking(true);
    setUpdate(null);
    void window.mvpfy
      .checkForUpdates()
      .then(setUpdate)
      .finally(() => setChecking(false));
  };
  const openExternal = (url: string) => void window.mvpfy.openExternal(url);
  const installUpdate = () => void window.mvpfy.installUpdate();

  return {
    login,
    checking,
    update,
    updateLine,
    gh,
    toolRun,
    toolLog,
    lastInstallLog,
    plans,
    hasTunnel,
    planFor,
    brewPlan,
    models,
    signIn,
    install,
    missingTools,
    installableNow,
    needOwnWindow,
    agentPresent,
    needsSignIn,
    signInStreams,
    signInAll,
    installAll,
    askAgentToInstall,
    checkForUpdates,
    openExternal,
    installUpdate,
  };
}
