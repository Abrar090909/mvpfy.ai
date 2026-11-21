import { describe, expect, it } from 'vitest';
import { hostEditsReachContainer, watcherNote } from './watchers';

describe('hostEditsReachContainer', () => {
  it('is true on a Mac, which was measured rather than assumed', () => {
    expect(
      hostEditsReachContainer({ workspacePath: '/Users/x/.mvpfy/shop', onWindows: false })
    ).toBe(true);
  });

  it('is true on Linux, where a bind mount is the host filesystem', () => {
    expect(
      hostEditsReachContainer({ workspacePath: '/home/x/.mvpfy/shop', onWindows: false })
    ).toBe(true);
  });

  it('is false for a Windows drive, which is where mvpfy clones today', () => {
    // The case that matters: ~/.mvpfy on Windows is C:\Users\…, so this is
    // every Windows user, not an edge case.
    expect(
      hostEditsReachContainer({ workspacePath: 'C:\\Users\\x\\.mvpfy\\shop', onWindows: true })
    ).toBe(false);
  });

  it('recognises a drive whatever its letter or slash', () => {
    for (const p of ['D:\\work\\shop', 'c:/Users/x/shop', 'Z:\\shop']) {
      expect(hostEditsReachContainer({ workspacePath: p, onWindows: true })).toBe(false);
    }
  });

  it('does not treat a path as a drive just because mvpfy runs on Windows', () => {
    // A WSL2 path is the open question Tier 2 has to measure; what matters
    // here is that the drive check is about the path, not the platform.
    expect(hostEditsReachContainer({ workspacePath: '/home/x/shop', onWindows: true })).toBe(true);
  });

  it('ignores the path entirely when the host is not Windows', () => {
    // A Mac cannot have a C:\ workspace, and if a path like that ever showed
    // up there it would not be because of 9P.
    expect(hostEditsReachContainer({ workspacePath: 'C:\\x', onWindows: false })).toBe(true);
  });
});

describe('watcherNote', () => {
  const mac = { workspacePath: '/Users/x/.mvpfy/shop', onWindows: false };
  const win = { workspacePath: 'C:\\Users\\x\\.mvpfy\\shop', onWindows: true };

  it('forbids polling where events arrive', () => {
    const note = watcherNote(mac);
    expect(note).toMatch(/Do NOT turn on polling/);
    expect(note).toMatch(/pegged core/);
    expect(note).not.toMatch(/REQUIRES polling/);
  });

  it('requires polling where no event is ever delivered', () => {
    const note = watcherNote(win);
    expect(note).toMatch(/REQUIRES polling file watchers/);
    expect(note).not.toMatch(/Do NOT turn on polling/);
  });

  it('names a setting for each watcher the stacks mvpfy supports actually use', () => {
    // A rule the agent cannot act on is a rule it will guess around.
    const note = watcherNote(win);
    for (const setting of [
      'CHOKIDAR_USEPOLLING',
      'CHOKIDAR_INTERVAL',
      'WATCHPACK_POLLING',
      'WATCHFILES_FORCE_POLLING',
      'ActiveSupport::FileUpdateChecker',
      '.air.toml',
    ]) {
      expect(note).toContain(setting);
    }
  });

  it('tells the agent what makes polling affordable, not just to switch it on', () => {
    // Polling without an ignore list is the pegged core it is meant to avoid,
    // and node_modules is the directory that does it.
    const note = watcherNote(win);
    expect(note).toMatch(/node_modules/);
    expect(note).toMatch(/environment:/);
    expect(note).toMatch(/mvpfy-run\.md/);
  });

  it('never tells the agent both things at once', () => {
    for (const input of [mac, win]) {
      const note = watcherNote(input);
      const forbids = /Do NOT turn on polling/.test(note);
      const requires = /REQUIRES polling/.test(note);
      expect(forbids).toBe(!requires);
    }
  });
});
