import { shellQuote, ShellResult, spawnShellAsync, spawnShellSync } from './shell';

/**
 * Questions asked of a repository's git, each in two forms: synchronous for
 * the command builders, which run once per click, and asynchronous for the
 * status the plan view polls, which must not hold the main process.
 */

/**
 * The branch a repository treats as its trunk. Read from origin/HEAD, which is
 * what the remote itself says; `main` only as a last resort.
 */
const defaultBranchCommand = (dir: string) =>
  `git -C ${shellQuote(dir)} rev-parse --abbrev-ref origin/HEAD`;

const defaultBranchFrom = (res: ShellResult): string =>
  (res.status === 0 ? res.stdout.trim().replace(/^origin\//, '') : '') || 'main';

export function defaultBranchOf(dir: string): string {
  return defaultBranchFrom(
    spawnShellSync(defaultBranchCommand(dir), { encoding: 'utf8', timeout: 10_000 })
  );
}

export async function defaultBranchOfAsync(dir: string): Promise<string> {
  return defaultBranchFrom(await spawnShellAsync(defaultBranchCommand(dir), { timeout: 10_000 }));
}

/** True when this repository has the branch at all. */
const hasBranchCommand = (dir: string, branch: string) =>
  `git -C ${shellQuote(dir)} rev-parse --verify ${shellQuote(branch)}`;

export function hasBranch(dir: string, branch: string): boolean {
  return (
    spawnShellSync(hasBranchCommand(dir, branch), { encoding: 'utf8', timeout: 10_000 }).status ===
    0
  );
}

export async function hasBranchAsync(dir: string, branch: string): Promise<boolean> {
  return (await spawnShellAsync(hasBranchCommand(dir, branch), { timeout: 10_000 })).status === 0;
}

/**
 * The trunk to measure against and merge: the remote's copy of it when this
 * repository has one fetched, and the local branch when it has not.
 *
 * The local trunk only moves when somebody pulls. A feature can be six commits
 * behind what everyone else has pushed while the local `main` says it is level,
 * and that is the number a PM is asking about.
 */
const trunkRefCommand = (dir: string, base: string) =>
  `git -C ${shellQuote(dir)} rev-parse --verify --quiet ${shellQuote(`refs/remotes/origin/${base}`)}`;

export function trunkRefFor(dir: string, base: string): string {
  const res = spawnShellSync(trunkRefCommand(dir, base), { encoding: 'utf8', timeout: 10_000 });
  return res.status === 0 ? `origin/${base}` : base;
}

export async function trunkRefForAsync(dir: string, base: string): Promise<string> {
  const res = await spawnShellAsync(trunkRefCommand(dir, base), { timeout: 10_000 });
  return res.status === 0 ? `origin/${base}` : base;
}

/** Commits `trunk` has that `branch` has not — what a merge would bring in. */
const behindCommand = (dir: string, branch: string, trunk: string) =>
  `git -C ${shellQuote(dir)} rev-list --count ${shellQuote(`${branch}..${trunk}`)}`;

// Unknown reads as level rather than as behind: offering to merge something
// that could not be counted would be a button with nothing behind it.
const behindFrom = (res: ShellResult): number =>
  res.status === 0 ? Number(res.stdout.trim()) || 0 : 0;

export async function commitsBehindAsync(
  dir: string,
  branch: string,
  trunk: string
): Promise<number> {
  return behindFrom(await spawnShellAsync(behindCommand(dir, branch, trunk), { timeout: 10_000 }));
}

/** True when this repository has somewhere to fetch from. */
export function hasOrigin(dir: string): boolean {
  return (
    spawnShellSync(`git -C ${shellQuote(dir)} remote get-url origin`, {
      encoding: 'utf8',
      timeout: 10_000,
    }).status === 0
  );
}

/** Commits `branch` has that `base` does not, or -1 when the range is unknown. */
export function commitsAhead(dir: string, base: string, branch: string): number {
  const count = (range: string) =>
    spawnShellSync(`git -C ${shellQuote(dir)} rev-list --count ${shellQuote(range)}`, {
      encoding: 'utf8',
      timeout: 10_000,
    });
  // Prefer the remote's copy of the trunk; fall back to the local one, which is
  // all there is on a repository that has never been pushed.
  for (const range of [`origin/${base}..${branch}`, `${base}..${branch}`]) {
    const res = count(range);
    if (res.status === 0) return Number(res.stdout.trim()) || 0;
  }
  // Neither range resolved, so the question is unanswered rather than answered
  // no. Say "unknown" and let the caller try anyway: excluding a repository on
  // a failed git command is how a pull request silently never gets raised, and
  // GitHub refusing it says far more than mvpfy quietly deciding not to ask.
  return -1;
}

/** commitsAhead, off the main thread: the same two ranges, the same "unknown". */
export async function commitsAheadAsync(
  dir: string,
  base: string,
  branch: string
): Promise<number> {
  for (const range of [`origin/${base}..${branch}`, `${base}..${branch}`]) {
    const res = await spawnShellAsync(
      `git -C ${shellQuote(dir)} rev-list --count ${shellQuote(range)}`,
      { timeout: 10_000 }
    );
    if (res.status === 0) return Number(res.stdout.trim()) || 0;
  }
  return -1;
}
