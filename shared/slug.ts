/** Derive a filesystem-safe slug from a repo URL or local path. */
export function slugFromRepoUrl(repoUrl: string): string {
  // Backslashes too: a Windows folder (C:\Users\me\code\shop) was one long
  // segment, and the project became "users-me-code-shop" instead of "shop".
  const cleaned = repoUrl.replace(/\.git$/, '').replace(/[/\\]+$/, '');
  const last =
    cleaned
      .split(/[/\\:]/)
      .filter(Boolean)
      .pop() || 'project';
  return (
    last
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

/**
 * The folder a project's feature checkouts live under, inside the worktrees
 * directory: its folder name, made unique by the start of its id, because two
 * projects may share a folder name.
 */
export function worktreeProjectKey(localPath: string, projectId: string): string {
  return `${localPath.split(/[/\\]/).pop() ?? 'project'}-${projectId.slice(0, 6)}`;
}
