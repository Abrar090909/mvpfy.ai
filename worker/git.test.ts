import { describe, expect, it } from 'vitest';
import { looksLikeSecret, parseStatus } from './git';

const z = (...entries: string[]) => entries.join('\0') + '\0';

describe('parseStatus', () => {
  it('takes modified, deleted and new files by path', () => {
    expect(parseStatus(z(' M src/app.ts', ' D old.ts', '?? src/new.ts')).paths).toEqual([
      'src/app.ts',
      'old.ts',
      'src/new.ts',
    ]);
  });

  it('takes the new side of a staged rename and never the mangled original', () => {
    // -z puts the original after the new path as its own entry; reading it as
    // `XY path` turned "src/old.ts" into "/old.ts" and git add failed.
    expect(parseStatus(z('R  src/new.ts', 'src/old.ts', ' M README.md')).paths).toEqual([
      'src/new.ts',
      'README.md',
    ]);
  });

  it('takes only the new side of a copy, and keeps reading after it', () => {
    expect(parseStatus(z('C  b.ts', 'a.ts', '?? c.ts')).paths).toEqual(['b.ts', 'c.ts']);
  });

  it('keeps paths with spaces exactly', () => {
    expect(parseStatus(z('?? docs/read me.md')).paths).toEqual(['docs/read me.md']);
  });

  it('withholds a new file that looks like a credential', () => {
    const { paths, withheld } = parseStatus(z('?? .env', '?? api/.env.local', '?? src/a.ts'));
    expect(paths).toEqual(['src/a.ts']);
    expect(withheld).toEqual(['.env', 'api/.env.local']);
  });

  it('leaves a tracked file that happens to look like one to the repository', () => {
    expect(parseStatus(z(' M .env')).paths).toEqual(['.env']);
  });

  it('reads empty output as nothing to commit', () => {
    expect(parseStatus('')).toEqual({ paths: [], withheld: [] });
  });
});

describe('looksLikeSecret', () => {
  it('catches the usual credential files', () => {
    for (const file of [
      '.env',
      '.env.local',
      '.env.production',
      'server.pem',
      'certs/tls.key',
      'id_rsa',
      'id_ed25519',
      '.npmrc',
      '.netrc',
      'credentials.json',
      'home/.ssh/config',
      '.aws/credentials',
    ]) {
      expect(looksLikeSecret(file), file).toBe(true);
    }
  });

  it('lets code and templates meant to be committed through', () => {
    for (const file of [
      '.env.example',
      '.env.sample',
      '.env.template',
      'src/env.ts',
      'environment.md',
      'id_rsa.pub',
      'keyboard.tsx',
      'src/keys.ts',
    ]) {
      expect(looksLikeSecret(file), file).toBe(false);
    }
  });
});
