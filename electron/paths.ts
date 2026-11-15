import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const MVPFY_HOME = path.join(os.homedir(), '.mvpfy');
export const PROJECTS_DIR = path.join(MVPFY_HOME, 'projects');
export const TMP_DIR = path.join(MVPFY_HOME, 'tmp');
/**
 * Per-feature checkouts, so implementing a story never disturbs the working
 * copy the builder is testing from. A root mvpfy owns outright, like the
 * projects directory — which is what keeps the path guard a containment check
 * rather than a new kind of permission.
 */
export const WORKTREES_DIR = path.join(MVPFY_HOME, 'worktrees');
export const STATE_FILE = path.join(MVPFY_HOME, 'state.json');
export const SECRETS_FILE = path.join(MVPFY_HOME, 'secrets.json');

export function ensureDirs(): void {
  for (const dir of [MVPFY_HOME, PROJECTS_DIR, TMP_DIR, WORKTREES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** True when `candidate` is inside the managed projects directory. */
export function isManagedPath(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return resolved !== PROJECTS_DIR && resolved.startsWith(PROJECTS_DIR + path.sep);
}

// Linked (in-place) projects live outside ~/.mvpfy/projects at paths the user
// explicitly chose. The registry mirrors state.json and is refreshed on every
// state read/write, so path guards can allow exactly those roots and no more.
let linkedRoots: string[] = [];

export function setLinkedRoots(roots: string[]): void {
  linkedRoots = roots.map((r) => path.resolve(r));
}

// The renderer saves the whole state, and linked roots are read out of it —
// so without this, renderer code saving `{mode: 'linked', localPath: '/'}`
// would make every guard below pass for the whole disk. A linked root has to
// have come from the main process: a folder linkProject resolved, or one the
// state on disk already held when the app started.
const approvedLinkedRoots = new Set<string>();

export function approveLinkedRoot(root: string): void {
  approvedLinkedRoots.add(path.resolve(root));
}

export function isApprovedLinkedRoot(root: string): boolean {
  return approvedLinkedRoots.has(path.resolve(root));
}

/** Test hook: forget every approval. */
export function resetLinkedRootApprovals(): void {
  approvedLinkedRoots.clear();
}

/** The only config folders a project uses (see configDirFor). */
const CONFIG_DIRS = new Set(['', '.mvpfy/']);

/**
 * A feature's config folder and slug, as they arrive from the renderer to be
 * joined onto a workspace path — and, in deleteFeatureFiles, handed to rm.
 * Either one carrying `..` or a separator would climb out of the workspace.
 */
export function assertFeatureLocation(configDir: string, slug: string): void {
  if (!CONFIG_DIRS.has(configDir)) throw new Error('That is not a project config folder');
  if (slug !== '' && (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..'))) {
    throw new Error('That is not a feature name');
  }
}

export function isLinkedPath(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return linkedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

/**
 * True when `candidate` is inside the worktrees directory. Deliberately NOT
 * part of isAllowedWorkspace: a worktree is somewhere mvpfy puts code, not a
 * workspace anything may be pointed at, and widening the workspace guard would
 * widen what every agent run, docker command and file write may reach.
 */
export function isWorktreePath(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return resolved !== WORKTREES_DIR && resolved.startsWith(WORKTREES_DIR + path.sep);
}

/** Managed clone or an explicitly linked in-place workspace. */
export function isAllowedWorkspace(candidate: string): boolean {
  return isManagedPath(candidate) || isLinkedPath(candidate);
}
