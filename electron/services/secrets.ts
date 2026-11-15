import { safeStorage } from 'electron';
import * as fs from 'node:fs';
import { ensureDirs, SECRETS_FILE } from '../paths';

/** OS-keychain-encrypted secret storage (~/.mvpfy/secrets.json). */

type SecretsMap = Record<string, string>;

function readSecrets(): SecretsMap {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) as SecretsMap;
  } catch {
    return {};
  }
}

/**
 * Marks a value stored without OS encryption. Before this, such a value was
 * indistinguishable from an encrypted one: once encryption became available
 * (a keyring unlocked, a desktop session started) it failed to decrypt and the
 * token was simply gone.
 */
const PLAIN = 'plain:';

export function keychainSet(entry: string, value: string): void {
  ensureDirs();
  const secrets = readSecrets();
  if (safeStorage.isEncryptionAvailable()) {
    secrets[entry] = safeStorage.encryptString(value).toString('base64');
  } else {
    // Fallback for environments without keychain access (e.g. Linux with no
    // keyring, some CI). Said out loud: this is the token in a file, kept from
    // other users only by the file's permissions.
    console.warn('mvpfy: OS encryption is unavailable; storing a token unencrypted');
    secrets[entry] = PLAIN + Buffer.from(value, 'utf8').toString('base64');
  }
  // Atomic, and 0600 enforced: `mode` on writeFileSync only applies when the
  // file is created, so a secrets file that already existed kept whatever
  // permissions it had.
  const tmp = `${SECRETS_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, SECRETS_FILE);
}

export function keychainGet(entry: string): string | null {
  const stored = readSecrets()[entry];
  if (!stored) return null;
  if (stored.startsWith(PLAIN)) {
    return Buffer.from(stored.slice(PLAIN.length), 'base64').toString('utf8');
  }
  const buf = Buffer.from(stored, 'base64');
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString('utf8');
  } catch {
    return null;
  }
}
