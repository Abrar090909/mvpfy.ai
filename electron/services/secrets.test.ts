import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvpfy-secrets-'));
const file = path.join(dir, 'secrets.json');
const encryption = { available: true };

vi.mock('../paths', () => ({ SECRETS_FILE: file, ensureDirs: () => undefined }));
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    // Reversible stand-in for the OS keychain: enough to tell encrypted from not.
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const text = b.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('not encrypted');
      return text.slice(4);
    },
  },
}));

const { keychainGet, keychainSet } = await import('./secrets');

beforeEach(() => {
  fs.rmSync(file, { force: true });
  encryption.available = true;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('secret storage', () => {
  it('round-trips through OS encryption', () => {
    keychainSet('acme', 'token-1');
    expect(keychainGet('acme')).toBe('token-1');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('token-1');
  });

  it('keeps a token stored without encryption readable once encryption arrives', () => {
    // Stored while no keyring was available, read after one unlocked: this
    // used to fail to decrypt and lose the token.
    encryption.available = false;
    keychainSet('acme', 'token-2');
    encryption.available = true;
    expect(keychainGet('acme')).toBe('token-2');
  });

  it.runIf(process.platform !== 'win32')('keeps the file private even if it existed before', () => {
    fs.writeFileSync(file, '{}', { mode: 0o644 });
    keychainSet('acme', 'token-3');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('returns nothing for an entry that was never stored', () => {
    expect(keychainGet('missing')).toBeNull();
  });
});
