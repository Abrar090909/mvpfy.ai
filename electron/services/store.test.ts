import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE, MvpfyState, Project } from '../../shared/types';
import {
  approveLinkedRoot,
  isLinkedPath,
  resetLinkedRootApprovals,
  setLinkedRoots,
} from '../paths';
import { readState, writeState } from './store';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvpfy-store-'));
  file = path.join(dir, 'state.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  setLinkedRoots([]);
  resetLinkedRootApprovals();
});

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    repos: [{ url: 'https://github.com/org/app.git', dir: '/Users/pm/.mvpfy/projects/app' }],
    localPath: '/Users/pm/.mvpfy/projects/app',
    basePort: 4100,
    status: 'stopped',
    lastStoryId: null,
    generatedFiles: ['mvpfy.yml'],
    ...overrides,
  };
}

describe('state store', () => {
  it('round-trips state through the file', () => {
    const state: MvpfyState = {
      tenant: { slug: 'acme', host: 'acme.feature1.ai', tokenKeychainEntry: 'acme-token' },
      projects: [project({ planSlugs: ['dark-mode'], mode: 'managed' })],
      settings: {
        defaultAgent: 'codex',
        codexModel: 'o3',
        claudeModel: 'opus',
        defaultStack: '',
      },
    };
    writeState(state, file);
    expect(readState(file)).toEqual(state);
  });

  it('fills in settings a previous version never wrote', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ tenant: null, projects: [], settings: { defaultAgent: 'codex' } })
    );
    const read = readState(file);
    expect(read.settings.defaultAgent).toBe('codex');
    expect(read.settings.claudeModel).toBe(DEFAULT_STATE.settings.claudeModel);
    expect(read.settings.codexModel).toBe(DEFAULT_STATE.settings.codexModel);
  });

  it('creates intermediate directories when writing', () => {
    const nested = path.join(dir, 'a', 'b', 'state.json');
    writeState(structuredClone(DEFAULT_STATE), nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('falls back to defaults when the file is missing or corrupt', () => {
    expect(readState(path.join(dir, 'nope.json'))).toEqual(DEFAULT_STATE);
    fs.writeFileSync(file, '{not json', 'utf8');
    expect(readState(file)).toEqual(DEFAULT_STATE);
  });

  it('keeps the previous state as a backup and leaves no temp file behind', () => {
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'old' })] }, file);
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'new' })] }, file);
    expect(readState(file).projects.map((p) => p.id)).toEqual(['new']);
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).projects[0].id).toBe('old');
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('recovers from the backup instead of starting empty when state.json is damaged', () => {
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    fs.writeFileSync(file, '{"projects": [', 'utf8'); // a write cut short
    expect(readState(file).projects.map((p) => p.id)).toEqual(['kept']);
    // The damaged file is set aside for recovery, not overwritten by the next save.
    const aside = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('{"projects": [');
  });

  it('leaves the file alone when the read itself failed, not the content', () => {
    // EACCES, EBUSY, EMFILE, a Windows file lock: the filesystem saying "not
    // now" says nothing about whether the file is state. Renaming somebody's
    // only project list over a blip is a bad trade when retrying costs
    // nothing — a directory where the file should be reproduces that shape.
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    fs.rmSync(file);
    fs.mkdirSync(file); // reading it now throws EISDIR, not a parse error
    expect(readState(file).projects.map((p) => p.id)).toEqual(['kept']);
    expect(fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'))).toEqual([]);
    expect(fs.existsSync(file)).toBe(true);
    fs.rmSync(file, { recursive: true });
  });

  it('takes the backup when a crash left no state.json between the two renames', () => {
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [project({ id: 'kept' })] }, file);
    fs.rmSync(file);
    expect(readState(file).projects.map((p) => p.id)).toEqual(['kept']);
  });

  it('fills missing settings from defaults', () => {
    fs.writeFileSync(file, JSON.stringify({ projects: [] }), 'utf8');
    expect(readState(file)).toEqual(DEFAULT_STATE);
  });

  it('migrates legacy single-repo projects to the repos array', () => {
    const legacy = { ...project(), repos: undefined, repoUrl: 'git@github.com:org/app.git' };
    delete (legacy as Record<string, unknown>).repos;
    fs.writeFileSync(file, JSON.stringify({ projects: [legacy] }), 'utf8');
    const read = readState(file);
    expect(read.projects[0].repos).toEqual([
      { url: 'git@github.com:org/app.git', dir: legacy.localPath },
    ]);
    expect((read.projects[0] as Record<string, unknown>).repoUrl).toBeUndefined();
  });

  it('surfaces a quit mid-bootstrap as an error status', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ projects: [project({ status: 'bootstrapping' })] }),
      'utf8'
    );
    expect(readState(file).projects[0].status).toBe('error');
  });

  it('drops a queued project back to the manual state on restart', () => {
    fs.writeFileSync(file, JSON.stringify({ projects: [project({ status: 'queued' })] }), 'utf8');
    expect(readState(file).projects[0].status).toBe('cloned');
  });

  it('registers linked project roots for the path guards on read and write', () => {
    const linked = project({ id: 'p2', localPath: '/Users/pm/code/shop', mode: 'linked' });
    approveLinkedRoot('/Users/pm/code/shop'); // what linkProject does
    writeState({ ...structuredClone(DEFAULT_STATE), projects: [linked] }, file);
    expect(isLinkedPath('/Users/pm/code/shop/api')).toBe(true);

    setLinkedRoots([]);
    readState(file);
    expect(isLinkedPath('/Users/pm/code/shop/api')).toBe(true);
    expect(isLinkedPath('/Users/pm/code/other')).toBe(false);
  });

  it('refuses to save a linked folder the main process never linked', () => {
    // Renderer code saving this used to make every path guard pass for the disk.
    const rogue = project({ id: 'p3', localPath: '/', mode: 'linked' });
    expect(() =>
      writeState({ ...structuredClone(DEFAULT_STATE), projects: [rogue] }, file)
    ).toThrow(/did not link/);
    expect(isLinkedPath('/etc/passwd')).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('trusts the linked folders already on disk when the app starts', () => {
    const linked = project({ id: 'p2', localPath: '/Users/pm/code/shop', mode: 'linked' });
    fs.writeFileSync(file, JSON.stringify({ projects: [linked] }), 'utf8');
    resetLinkedRootApprovals();
    const state = readState(file);
    expect(() => writeState(state, file)).not.toThrow();
  });
});

describe('the Codex model mvpfy used to choose', () => {
  it('is cleared, because a ChatGPT account refuses it', () => {
    // Every Codex run failed at the first request for anyone signed in that
    // way. Nobody picked it — it was the default — so it does not survive.
    fs.writeFileSync(
      file,
      JSON.stringify({ projects: [], settings: { codexModel: 'gpt-5.3-codex' } }),
      'utf8'
    );
    expect(readState(file).settings.codexModel).toBe('');
  });

  it('leaves a model somebody typed exactly as they typed it', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({ projects: [], settings: { codexModel: 'gpt-5-codex' } }),
      'utf8'
    );
    expect(readState(file).settings.codexModel).toBe('gpt-5-codex');
  });

  it('names no model by default, so codex uses its own', () => {
    expect(DEFAULT_STATE.settings.codexModel).toBe('');
  });
});

it('disconnects legacy shared-login connections while preserving projects', () => {
  const projects = [project()];
  fs.writeFileSync(
    file,
    JSON.stringify({
      tenant: { slug: 'watiq', host: 'watiq-mcp.feature1.ai', tokenKeychainEntry: '' },
      projects,
    })
  );
  const state = readState(file);
  expect(state.tenant).toBeNull();
  expect(state.projects).toEqual(projects);
});
