import { posixQuote } from '../../shared/shellQuote';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

// GUI apps on macOS get a minimal PATH; run commands through the user's login
// shell so tools installed via Homebrew/nvm/etc. are found. On Windows we go
// through cmd.exe instead.
export const IS_WIN = process.platform === 'win32';
export const USER_SHELL =
  process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

/**
 * cmd.exe arguments for a command that is ALREADY quoted for the shell.
 *
 * Node escapes each argument using Windows CRT rules before building the
 * command line, which rewrites our inner quotes as \" — a form cmd.exe does
 * not understand and passes through literally, so the child ends up with real
 * quote characters inside its arguments (a clone destination like "C:\...\repo"
 * is then an invalid Windows filename). Callers must therefore pair this with
 * windowsVerbatimArguments so the string survives untouched; the outer quotes
 * added here are the ones `/s` strips back off before running the command.
 */
export function winShellArgs(command: string): string[] {
  return ['/d', '/s', '/c', `"${command}"`];
}

const WIN_SHELL = () => process.env.ComSpec || 'cmd.exe';

/**
 * `env -0` output: NUL between entries, the first `=` splitting each one.
 *
 * NUL-separated rather than line-separated because a value may legitimately
 * contain a newline, and a line parser silently truncates it.
 */
export function parseEnvDump(dump: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const entry of dump.split('\0')) {
    if (!entry) continue;
    const at = entry.indexOf('=');
    if (at <= 0) continue;
    out[entry.slice(0, at)] = entry.slice(at + 1);
  }
  return out;
}

/**
 * The environment a login shell would have given us, worked out ONCE.
 *
 * A GUI app launched from Finder gets a minimal PATH, so every command used
 * to run through `zsh -lc` to pick up Homebrew, nvm and the rest. That is
 * correct and it is extremely expensive: measured on a developer's machine,
 * `git rev-parse` costs 11ms on its own and 101ms through a login shell —
 * the profile is sourced, nvm and all, before the command starts. mvpfy
 * fires twenty to thirty small commands on a single refresh, so it was
 * paying two to three seconds of shell start-up to do a quarter-second of
 * work. That is why a faster machine did not help.
 *
 * So the profile is sourced once, its environment kept, and every command
 * afterwards runs with a plain `-c` and that environment. Same tools found,
 * one cost instead of thousands.
 */
let cachedLoginEnv: NodeJS.ProcessEnv | null = null;
let loginEnvResolved = false;

export function resolveLoginEnv(): NodeJS.ProcessEnv {
  if (loginEnvResolved) return cachedLoginEnv ?? process.env;
  loginEnvResolved = true;
  if (IS_WIN) return process.env;
  try {
    const res = spawnSync(USER_SHELL, ['-lc', 'env -0'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    const parsed = res.status === 0 ? parseEnvDump(res.stdout ?? '') : {};
    // A PATH is the whole point; without one the dump is not worth trusting
    // and the old behaviour is better than a broken environment.
    if (parsed.PATH) cachedLoginEnv = { ...process.env, ...parsed };
  } catch {
    // Falls back below, which is what mvpfy did before this existed.
  }
  return cachedLoginEnv ?? process.env;
}

/** True when the profile was read and can be reused. Falls back if not. */
function haveLoginEnv(): boolean {
  resolveLoginEnv();
  return cachedLoginEnv !== null;
}

/** Only for tests: forget what was resolved. */
export function forgetLoginEnv(): void {
  cachedLoginEnv = null;
  loginEnvResolved = false;
}

export function spawnShell(command: string, opts: Parameters<typeof spawn>[2]): ChildProcess {
  if (IS_WIN) {
    return spawn(WIN_SHELL(), winShellArgs(command), { ...opts, windowsVerbatimArguments: true });
  }
  // `detached` makes the shell a process-group leader, so killProcessTree can
  // stop what it started and not just the shell (see signalGroup).
  if (!haveLoginEnv()) return spawn(USER_SHELL, ['-lc', command], { ...opts, detached: true });
  // The caller's own env wins: it is asking for something specific, such as
  // the Docker context or a git prompt being turned off.
  return spawn(USER_SHELL, ['-c', command], {
    ...opts,
    detached: true,
    env: { ...resolveLoginEnv(), ...(opts?.env ?? {}) },
  });
}

export function spawnShellSync(
  command: string,
  opts: { encoding: 'utf8'; timeout: number; env?: NodeJS.ProcessEnv; cwd?: string }
) {
  if (IS_WIN) {
    return spawnSync(WIN_SHELL(), winShellArgs(command), {
      ...opts,
      windowsVerbatimArguments: true,
    });
  }
  if (!haveLoginEnv()) return spawnSync(USER_SHELL, ['-lc', command], opts);
  return spawnSync(USER_SHELL, ['-c', command], {
    ...opts,
    env: { ...resolveLoginEnv(), ...(opts.env ?? {}) },
  });
}

/** What spawnShellSync returns, and the shape spawnShellAsync keeps. */
export interface ShellResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * spawnShellSync without blocking the main process.
 *
 * The main process is the one that paints the window and carries every IPC
 * message, so each spawnSync froze the app for as long as its command ran —
 * a docker compose call polled every two seconds with a 15 s timeout, eight
 * git calls per repository for a feature's status, a `gh` call per pull
 * request. Same command, same shell, same result shape; it just waits
 * without stopping everything else. A timeout kills the command and reports
 * a null status, as spawnSync does.
 */
export function spawnShellAsync(
  command: string,
  opts: { timeout: number; env?: NodeJS.ProcessEnv; cwd?: string }
): Promise<ShellResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawnShell(command, {
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        ...(opts.env ? { env: opts.env } : {}),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ status: null, stdout: '', stderr: String((error as Error).message) });
      return;
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, opts.timeout);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr: stderr + String(error.message) });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status: timedOut ? null : status, stdout, stderr });
    });
  });
}

/**
 * `cd` into a directory as part of a shell command. cmd.exe will not follow a
 * path onto a different drive without /d — it changes the directory on that
 * drive and carries on running where it was, so the command silently executes
 * against the wrong folder rather than failing.
 */
export function cdTo(dir: string): string {
  return IS_WIN ? `cd /d ${shellQuote(dir)}` : `cd ${shellQuote(dir)}`;
}

export function shellQuote(value: string): string {
  if (IS_WIN) return `"${value.replace(/"/g, '""')}"`;
  return posixQuote(value);
}

/**
 * Open the user's own terminal in a directory, so they can talk to their agent
 * with their own setup — their shell, their history, their sign-in.
 *
 * Linux has no one terminal, so several are tried in turn; the first that
 * exists wins and the rest are never reached.
 */
export function openTerminalCommand(cwd: string): string {
  const dir = shellQuote(cwd);
  if (IS_WIN) return `start "" cmd /k cd /d ${dir}`;
  if (process.platform === 'darwin') {
    // Two layers: Terminal runs this as a shell command, so the path is quoted
    // for the shell first; that string then lives inside an AppleScript
    // literal, so it is escaped for AppleScript second. Quoting only the outer
    // one leaves a project folder with a space failing to cd.
    const inner = `cd ${shellQuote(cwd)}`;
    const applescript = `tell application "Terminal" to do script "${inner
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')}"`;
    return `osascript -e 'tell application "Terminal" to activate' -e ${shellQuote(applescript)}`;
  }
  // The first three take the directory as an argument and are safe with it
  // quoted. xterm takes a shell command, so the path goes through a shell a
  // second time: unquoted there, a project folder with a space in it failed to
  // cd, and one whose name held a `;` or a `$(…)` would have run as a command.
  // The inner quoting is what makes a folder name a folder name again.
  const inner = `cd ${dir}; exec $SHELL`;
  return (
    `x-terminal-emulator --working-directory=${dir} || ` +
    `gnome-terminal --working-directory=${dir} || ` +
    `konsole --workdir ${dir} || ` +
    `xterm -e ${shellQuote(inner)}`
  );
}

/**
 * Stop a spawned command and everything it started.
 *
 * Every command runs through a shell, so the process we hold is cmd.exe or
 * zsh — docker, claude and git are its children. On POSIX a signal to the
 * process group reaches them. On Windows there are no process groups and
 * child.kill() maps to TerminateProcess on the shell alone, so the real work
 * carries on with nobody watching it: taskkill /T walks the tree instead.
 */
export function killProcessTree(child: ChildProcess | undefined): void {
  const pid = child?.pid;
  if (!child || !pid) return;
  if (IS_WIN) {
    // Not spawnSync: taskkill can take seconds, and that froze the window
    // every time somebody pressed Stop.
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }).on(
        'error',
        () => undefined
      );
    } catch {
      // Better a stray process than a crash.
    }
    return;
  }
  signalGroup(child, pid, 'SIGTERM');
  // Something that ignores SIGTERM (a dev server mid-shutdown, a hung agent)
  // still has to go; unref'd so it never holds the app open.
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalGroup(child, pid, 'SIGKILL');
  }, 5_000).unref();
}

/**
 * spawnShell starts the shell as a process-group leader (`detached`), so its
 * pid is the group id and a negative pid signals the shell and everything it
 * started — `cd x && claude …`, `docker compose up`, a dev server — together.
 */
function signalGroup(child: ChildProcess, pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Not a group leader (or already gone): the shell alone is what is left.
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}

/**
 * Stop many runs at once, for quitting: on Windows one blocking taskkill for
 * all of them — the app is about to exit, so it has to finish before that,
 * but one call rather than one per run.
 */
export function killProcessTrees(children: ChildProcess[]): void {
  if (!IS_WIN) {
    for (const child of children) killProcessTree(child);
    return;
  }
  const pids = children.map((c) => c.pid).filter((pid): pid is number => Boolean(pid));
  if (pids.length === 0) return;
  try {
    spawnSync('taskkill', [...pids.flatMap((pid) => ['/pid', String(pid)]), '/T', '/F'], {
      timeout: 10_000,
    });
  } catch {
    // Fall through: better a stray process than a crash on quit.
  }
}

/** `%VAR%` references, as stored in the registry's REG_EXPAND_SZ PATH. */
function expandWinVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole);
}

/**
 * Directories out of `reg query ... /v Path` output, which looks like:
 *
 *     HKEY_CURRENT_USER\Environment
 *         Path    REG_EXPAND_SZ    C:\Users\me\.local\bin;%APPDATA%\npm
 *
 * PATHEXT cannot be mistaken for Path: the name must be followed by space.
 */
export function parseRegistryPath(stdout: string): string[] {
  const match = stdout.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+)$/im);
  if (!match) return [];
  return expandWinVars(match[1].trim())
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** PATH as the registry records it — the value a new process would inherit. */
function registryPath(): string[] {
  const keys = [
    'HKCU\\Environment',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
  ];
  const out: string[] = [];
  for (const key of keys) {
    try {
      const res = spawnSync('reg', ['query', key, '/v', 'Path'], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (res.status === 0) out.push(...parseRegistryPath(res.stdout));
    } catch {
      // No reg.exe, or a locked-down machine: fall back to the inherited PATH.
    }
  }
  return out;
}

/**
 * Windows hands a running app the environment it started with, and editing
 * PATH in System Properties does not reach one — nor, usually, anything else
 * launched from the Explorer session that was already open, until the user
 * signs out. So read PATH from the registry, where the edit actually landed,
 * and add the places our CLIs install themselves even when PATH was never
 * updated at all.
 */
export function resolveWindowsPath(): void {
  process.env.PATH = mergeWindowsPath(process.env.PATH || '', registryPath());
}

/** The inherited PATH, then the registry's, then where the tools install. */
export function mergeWindowsPath(inherited: string, registry: string[]): string {
  const home = process.env.USERPROFILE || os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const extras = [
    path.join(home, '.local', 'bin'), // claude, the native installer
    path.join(appData, 'npm'), // codex and anything else installed by npm -g
    path.join(localAppData, 'Programs', 'Git', 'cmd'),
    path.join(programFiles, 'Git', 'cmd'),
    path.join(programFiles, 'GitHub CLI'),
    path.join(programFiles, 'Docker', 'Docker', 'resources', 'bin'),
  ];
  const merged = new Set(
    [...inherited.split(';'), ...registry, ...extras].map((entry) => entry.trim()).filter(Boolean)
  );
  return [...merged].join(';');
}

/**
 * Finder-launched apps get a minimal PATH, and `zsh -lc` only sources
 * ~/.zprofile — while nvm/npm tools usually configure PATH in ~/.zshrc
 * (interactive-only). Resolve the user's real PATH once via an interactive
 * login shell and adopt it, so claude/codex/gh installed any way are found.
 */
export function resolveUserPath(): void {
  if (IS_WIN) {
    resolveWindowsPath();
    return;
  }
  try {
    const result = spawnSync(USER_SHELL, ['-ilc', 'printf "__MVPFY_PATH__%s" "$PATH"'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    const match = result.stdout?.match(/__MVPFY_PATH__([^\n]*)/);
    process.env.PATH = mergePosixPath(match?.[1] ?? '', process.env.PATH ?? '');
  } catch {
    // Keep the inherited PATH; the Settings checklist will surface gaps.
  }
}

/** The shell's PATH, then the inherited one, then the usual install spots. */
export function mergePosixPath(shellPath: string, inherited: string): string {
  const extras = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), 'bin'),
  ];
  const merged = new Set(
    [...shellPath.split(':'), ...inherited.split(':'), ...extras].filter(Boolean)
  );
  return [...merged].join(':');
}

/** A command's stdout and status, without blocking the main process. */
function capture(
  file: string,
  args: string[],
  timeoutMs: number
): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let child: ChildProcess;
    try {
      child = spawn(file, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve({ status: null, stdout: '' });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ status: null, stdout });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout });
    });
  });
}

/**
 * resolveUserPath and resolveLoginEnv together, without blocking anything.
 *
 * Each started a login shell with spawnSync — the first before the window
 * was even created (up to 10 s of nothing on screen), the second on the
 * first command after it (up to 15 s of a frozen window). Here both shells
 * run at once, off the main thread, and the results are merged exactly as
 * the two did in sequence: the interactive shell's PATH first, then the
 * login environment over the top of it.
 */
export async function resolveUserEnvironment(): Promise<void> {
  if (IS_WIN) {
    const keys = [
      'HKCU\\Environment',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
    ];
    const answers = await Promise.all(
      keys.map((key) => capture('reg', ['query', key, '/v', 'Path'], 10_000))
    );
    const registry = answers.flatMap((a) => (a.status === 0 ? parseRegistryPath(a.stdout) : []));
    process.env.PATH = mergeWindowsPath(process.env.PATH ?? '', registry);
    return;
  }
  const [interactive, login] = await Promise.all([
    capture(USER_SHELL, ['-ilc', 'printf "__MVPFY_PATH__%s" "$PATH"'], 10_000),
    loginEnvResolved ? null : capture(USER_SHELL, ['-lc', 'env -0'], 15_000),
  ]);
  const shellPath = interactive.stdout.match(/__MVPFY_PATH__([^\n]*)/)?.[1] ?? '';
  process.env.PATH = mergePosixPath(shellPath, process.env.PATH ?? '');
  if (login && !loginEnvResolved) {
    loginEnvResolved = true;
    const parsed = login.status === 0 ? parseEnvDump(login.stdout) : {};
    if (parsed.PATH) cachedLoginEnv = { ...process.env, ...parsed };
  }
}
