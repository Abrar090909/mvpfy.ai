import { useState } from 'react';
import { BlankProjectRemote, MvpfyState, Project } from '../../shared/types';
import { UpdateState } from './useProjectController';
import { allocateBasePort, newProjectId } from '../lib/state';

/** Repo entries from the textarea: one per line (commas allowed too). */
export function splitEntries(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Absolute, home-relative, relative, or Windows drive-letter path. */
function isLocalPath(entry: string): boolean {
  return /^([~/.]|[A-Za-z]:[\\/])/.test(entry);
}

/**
 * Adding a project: cloning or linking existing repositories, or starting a
 * new one, and recording it. AddProjectView only lays this out — the same
 * split as Settings and the project views, and the repository's rule that
 * components never call window.mvpfy.
 */
export function useAddProject(
  state: MvpfyState,
  updateState: UpdateState,
  onCreated: (projectId: string) => void
) {
  const [text, setText] = useState('');
  const [cloning, setCloning] = useState(false);
  const [inPlace, setInPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'existing' | 'new'>('existing');
  const [newName, setNewName] = useState('');
  const [remoteKind, setRemoteKind] = useState<BlankProjectRemote['kind']>('create');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const firstRun = state.projects.length === 0;
  const entries = splitEntries(text);
  // In-place mode works from one folder root, so it is only offered for a
  // single local entry — several repos come in as copies.
  const looksLocal = entries.length === 1 && isLocalPath(entries[0]);

  async function add() {
    const urls = entries;
    if (urls.length === 0 || cloning) return;
    const link = inPlace && looksLocal;
    if (inPlace && urls.length > 1) {
      setError(
        'In-place mode takes a single local folder. To use several repos in place, pick the folder that contains them.'
      );
      return;
    }
    setCloning(true);
    setError(null);
    try {
      const result = await window.mvpfy.createProject(urls, link);
      if (!result.ok) {
        setError(result.error || 'Clone failed');
        return;
      }
      const project: Project = {
        id: newProjectId(),
        repos: result.repos.map(({ url, dir }) => ({ url, dir })),
        localPath: result.workspacePath,
        basePort: await allocateBasePort(state),
        // Bootstrap starts by itself once the project view opens.
        status: 'queued',
        lastStoryId: null,
        generatedFiles: [],
        mode: link ? 'linked' : 'managed',
      };
      updateState((prev) => ({ ...prev, projects: [...prev.projects, project] }));
      setText('');
      onCreated(project.id);
    } finally {
      setCloning(false);
    }
  }

  async function startFromScratch() {
    if (!newName.trim() || cloning) return;
    setCloning(true);
    setError(null);
    setNotice(null);
    try {
      const remote: BlankProjectRemote =
        remoteKind === 'existing' ? { kind: 'existing', url: remoteUrl } : { kind: remoteKind };
      const result = await window.mvpfy.createBlankProject(newName, remote);
      if (!result.ok) {
        setError(result.error || 'Could not create the project');
        return;
      }
      const project: Project = {
        id: newProjectId(),
        repos: result.repos.map(({ url, dir }) => ({ url, dir })),
        localPath: result.workspacePath,
        basePort: await allocateBasePort(state),
        // Not 'queued': that bootstraps on open, and there is nothing here to
        // work out how to run yet. The environment is set up once the first
        // story has built something — until then the button is there to press.
        status: 'cloned',
        lastStoryId: null,
        generatedFiles: [],
        mode: 'managed',
      };
      if (result.remoteError) {
        // The workspace is real and usable; only GitHub is missing. Losing the
        // project over that would be worse than saying so.
        setNotice(
          `The project was created, but GitHub was not: ${result.remoteError}\nEverything works except raising a pull request — add a remote when you are ready.`
        );
      }
      updateState((prev) => ({ ...prev, projects: [...prev.projects, project] }));
      setNewName('');
      onCreated(project.id);
    } finally {
      setCloning(false);
    }
  }

  /** Adds folders chosen in the OS picker to the list, skipping repeats. */
  const browse = () =>
    void window.mvpfy.pickDirectory().then((dirs) => {
      if (!dirs?.length) return;
      setText((prev) => {
        const existing = splitEntries(prev);
        const added = dirs.filter((d) => !existing.includes(d));
        return [...existing, ...added].join('\n');
      });
    });

  return {
    text,
    setText,
    cloning,
    inPlace,
    setInPlace,
    error,
    setError,
    source,
    setSource,
    newName,
    setNewName,
    remoteKind,
    setRemoteKind,
    remoteUrl,
    setRemoteUrl,
    notice,
    firstRun,
    looksLocal,
    add,
    startFromScratch,
    browse,
  };
}
