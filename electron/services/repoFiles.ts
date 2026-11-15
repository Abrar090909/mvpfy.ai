import * as fs from 'node:fs';
import * as path from 'node:path';
import { RepoFile } from '../../shared/types';
import { isAllowedWorkspace } from '../paths';

/**
 * Files inside a project the renderer reads and writes — the questions an
 * agent asks, the answers given, its triage notes. The one door from the
 * renderer to arbitrary paths, so every request is held to the workspace
 * guard and to the real path behind any symlink.
 */

/** `candidate` is `root` itself or somewhere below it. */
function within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * The workspace a renderer file request may touch, with symlinks resolved.
 * The renderer names the root, so it has to be a workspace the path guard
 * already allows; resolving it means a symlinked checkout compares like-for-like
 * with the resolved targets below.
 */
function workspaceRoot(repoPath: string): string {
  const root = path.resolve(repoPath);
  if (!isAllowedWorkspace(root)) {
    throw new Error('Repo files are restricted to managed and linked project directories');
  }
  try {
    return fs.realpathSync(root);
  } catch {
    // Not on disk (a deleted checkout): reads find nothing, writes fail as before.
    return root;
  }
}

/**
 * Reads files a repo's agents produce. A lexical check alone is not enough:
 * a cloned repo can ship `mvpfy-questions.md -> ~/.ssh/id_rsa`, so the target
 * is resolved and must still land inside the workspace.
 */
export function readRepoFiles(repoPath: string, relativePaths: string[]): RepoFile[] {
  const root = workspaceRoot(repoPath);
  return relativePaths.map((rel) => {
    const missing = { relativePath: rel, exists: false, content: null };
    if (!within(root, path.resolve(root, rel))) return missing;
    try {
      const real = fs.realpathSync(path.resolve(root, rel));
      if (!within(root, real)) return missing;
      return { relativePath: rel, exists: true, content: fs.readFileSync(real, 'utf8') };
    } catch {
      return missing;
    }
  });
}

/**
 * Writes a file inside the workspace. Refuses to write through a symlink —
 * the app empties files like `mvpfy-questions.md`, and a repo that links one
 * to `~/.zshrc` must not get the user's shell config wiped — and resolves the
 * parent so a symlinked directory cannot carry the write outside either.
 */
export function writeRepoFile(repoPath: string, relativePath: string, content: string): void {
  const root = workspaceRoot(repoPath);
  const abs = path.resolve(root, relativePath);
  if (abs === root || !within(root, abs)) {
    throw new Error('Refusing to write outside the repo');
  }
  if (!within(root, fs.realpathSync(path.dirname(abs)))) {
    throw new Error('Refusing to write outside the repo');
  }
  let isLink = false;
  try {
    isLink = fs.lstatSync(abs).isSymbolicLink();
  } catch {
    // Not there yet: a fresh file, which is fine.
  }
  if (isLink) throw new Error('Refusing to write through a symlink');
  fs.writeFileSync(abs, content, 'utf8');
}
