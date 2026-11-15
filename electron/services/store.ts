import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_STATE,
  MvpfyState,
  Project,
  RETIRED_CODEX_MODEL,
  Settings,
} from '../../shared/types';
import {
  approveLinkedRoot,
  ensureDirs,
  isApprovedLinkedRoot,
  setLinkedRoots,
  STATE_FILE,
} from '../paths';

/** Persistent app state (~/.mvpfy/state.json) — the app's Model. */

function syncLinkedRoots(projects: Project[]): void {
  setLinkedRoots(projects.filter((p) => p.mode === 'linked').map((p) => p.localPath));
}

/**
 * Clear the Codex model mvpfy used to choose for everyone.
 *
 * A ChatGPT account rejects it, so every Codex run failed at the first
 * request. It was never anybody's choice, and leaving it in place would leave
 * Codex broken for everyone who has already run mvpfy — a model somebody typed
 * themselves is left exactly as they typed it.
 */
function retireBrokenCodexModel(settings: Settings): Settings {
  return settings.codexModel === RETIRED_CODEX_MODEL ? { ...settings, codexModel: '' } : settings;
}

/** The previous good copy, kept by every write (see writeState). */
const backupOf = (file: string): string => `${file}.bak`;

function parseState(file: string): MvpfyState {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<MvpfyState>;
  return {
    // Legacy shared-server connections have no client credential and are unsafe.
    tenant: parsed.tenant?.tokenKeychainEntry?.trim() ? parsed.tenant : null,
    projects: migrateProjects(parsed.projects ?? []),
    settings: retireBrokenCodexModel({ ...DEFAULT_STATE.settings, ...parsed.settings }),
  };
}

/**
 * `file` overrides the state location — production always uses STATE_FILE.
 *
 * An unreadable file is never silently replaced: the renderer saves the whole
 * state on its next change, so returning defaults here used to mean that
 * every project was gone for good one save later. The damaged file is set
 * aside for recovery, and the copy the last write kept is used instead.
 */
export function readState(file: string = STATE_FILE): MvpfyState {
  let state: MvpfyState | null;
  try {
    state = parseState(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      const aside = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, aside);
        console.error(`mvpfy: ${file} could not be read; kept it as ${aside}`);
      } catch {
        // Could not move it either; the backup below is still worth trying.
      }
    }
    try {
      state = parseState(backupOf(file));
    } catch {
      state = null;
    }
  }
  const result = state ?? structuredClone(DEFAULT_STATE);
  // What is on disk is the baseline the guards trust: it was saved before this
  // run, through writeState's check, and a running renderer cannot rewrite it.
  for (const p of result.projects) if (p.mode === 'linked') approveLinkedRoot(p.localPath);
  syncLinkedRoots(result.projects);
  return result;
}

/** Refuse a state whose linked folders the main process never approved. */
function assertLinkedRootsApproved(projects: Project[]): void {
  for (const p of projects) {
    if (p.mode === 'linked' && !isApprovedLinkedRoot(p.localPath)) {
      throw new Error(`Refusing to save a linked folder mvpfy did not link: ${p.localPath}`);
    }
  }
}

/**
 * `file` overrides the state location — production always uses STATE_FILE.
 *
 * Written to a temporary file and renamed into place, so a crash, a full disk
 * or a power cut mid-write leaves either the old state or the new one, never
 * half of one. The old file becomes the backup first; a crash between the two
 * renames leaves no state.json, and readState then takes the backup.
 */
export function writeState(state: MvpfyState, file: string = STATE_FILE): void {
  if (file === STATE_FILE) ensureDirs();
  else fs.mkdirSync(path.dirname(file), { recursive: true });
  assertLinkedRootsApproved(state.projects);
  syncLinkedRoots(state.projects);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  try {
    if (fs.existsSync(file)) fs.renameSync(file, backupOf(file));
    fs.renameSync(tmp, file);
  } catch (error) {
    // Windows refuses a rename while something (an indexer, an antivirus
    // scan) holds the file open. Better a plain write than no save at all.
    fs.rmSync(tmp, { force: true });
    if (!fs.existsSync(file) && fs.existsSync(backupOf(file))) {
      fs.copyFileSync(backupOf(file), file);
    }
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
    console.error('mvpfy: atomic state save failed, wrote in place instead', error);
  }
}

/** Migrate pre-multi-repo projects ({repoUrl} → {repos: [{url, dir}]}). */
function migrateProjects(raw: unknown[]): Project[] {
  return (raw as Array<Record<string, unknown>>).map((p) => {
    if (!p.repos && typeof p.repoUrl === 'string') {
      const { repoUrl, ...rest } = p;
      p = { ...rest, repos: [{ url: repoUrl, dir: p.localPath }] };
    }
    // A quit mid-bootstrap leaves 'bootstrapping' frozen in state with no run
    // behind it; surface it as an error so Diagnose & fix can take over.
    if (p.status === 'bootstrapping') {
      p = { ...p, status: 'error' };
    }
    // A quit before the queued bootstrap started: nothing ran, so drop back to
    // the manual state rather than auto-running an agent on the next launch.
    if (p.status === 'queued') {
      p = { ...p, status: 'cloned' };
    }
    return p;
  }) as unknown as Project[];
}
