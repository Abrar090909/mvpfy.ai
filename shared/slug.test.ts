import { describe, expect, it } from 'vitest';
import { slugFromRepoUrl, worktreeProjectKey } from './slug';

describe('slugFromRepoUrl', () => {
  it('slugs https URLs', () => {
    expect(slugFromRepoUrl('https://github.com/org/My-Repo.git')).toBe('my-repo');
  });

  it('slugs ssh URLs', () => {
    expect(slugFromRepoUrl('git@github.com:org/backend.git')).toBe('backend');
  });

  it('slugs local paths', () => {
    expect(slugFromRepoUrl('/Users/me/projects/Jarshare')).toBe('jarshare');
    expect(slugFromRepoUrl('~/projects/app/')).toBe('app');
  });

  it('falls back for degenerate input', () => {
    expect(slugFromRepoUrl('///')).toBe('project');
  });
});

describe('slugFromRepoUrl on Windows paths', () => {
  it('names a project after the folder, not the whole path', () => {
    expect(slugFromRepoUrl('C:\\Users\\me\\code\\shop')).toBe('shop');
    expect(slugFromRepoUrl('C:\\Users\\me\\code\\shop\\')).toBe('shop');
    expect(slugFromRepoUrl('D:\\work\\My App.git')).toBe('my-app');
  });
});

describe('worktreeProjectKey', () => {
  it('is the folder name plus the start of the id, on any platform', () => {
    expect(worktreeProjectKey('/Users/pm/code/shop', 'abcdef123456')).toBe('shop-abcdef');
    expect(worktreeProjectKey('C:\\Users\\pm\\shop', 'abcdef123456')).toBe('shop-abcdef');
  });
});
