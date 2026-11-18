import { describe, expect, it } from 'vitest';
import { missingEntitlements, REQUIRED_ENTITLEMENTS, signingPlan } from './signing.mjs';

const WITH_CERT = { hasDeveloperId: true };
const PROFILE = { APPLE_KEYCHAIN_PROFILE: 'mvpfy-notary' };
const API_KEY = {
  APPLE_API_KEY: '/keys/AuthKey_ABC.p8',
  APPLE_API_KEY_ID: 'ABC123',
  APPLE_API_ISSUER: '69a6de80-0000-0000-0000-000000000000',
};

describe('signingPlan', () => {
  it('is happy with a certificate and a keychain profile', () => {
    const plan = signingPlan({ ...WITH_CERT, env: PROFILE, release: true });
    expect(plan.ok).toBe(true);
    expect(plan.signing).toMatch(/keychain/);
    expect(plan.notarizing).toContain('mvpfy-notary');
  });

  it('is happy with a certificate and a complete App Store Connect key', () => {
    const plan = signingPlan({ ...WITH_CERT, env: API_KEY, release: true });
    expect(plan.ok).toBe(true);
    expect(plan.notarizing).toMatch(/App Store Connect/);
  });

  it('refuses the app-specific password combination, which fails only at the end', () => {
    // The whole reason this module exists: electron-builder's `notarize: true`
    // never passes a team id, and notarytool requires one here, so the build
    // dies after signing with a message about a JSON property.
    const plan = signingPlan({
      ...WITH_CERT,
      env: { APPLE_ID: 'a@b.com', APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop' },
      release: true,
    });
    expect(plan.ok).toBe(false);
    expect(plan.problems.join('\n')).toMatch(/store-credentials/);
  });

  it('says so when APPLE_ID would shadow a profile that is also set', () => {
    const plan = signingPlan({
      ...WITH_CERT,
      env: { ...PROFILE, APPLE_ID: 'a@b.com', APPLE_APP_SPECIFIC_PASSWORD: 'x' },
    });
    expect(plan.notes.join('\n')).toMatch(/shadows it/);
  });

  it('names the missing half of a partly configured API key', () => {
    const plan = signingPlan({
      ...WITH_CERT,
      env: { APPLE_API_KEY: '/keys/k.p8', APPLE_API_KEY_ID: 'ABC123' },
      release: true,
    });
    expect(plan.ok).toBe(false);
    expect(plan.problems.join('\n')).toContain('APPLE_API_ISSUER');
  });

  it('treats no notarization as a failure for a release and a note otherwise', () => {
    expect(signingPlan({ ...WITH_CERT, env: {}, release: true }).ok).toBe(false);
    const local = signingPlan({ ...WITH_CERT, env: {} });
    expect(local.ok).toBe(true);
    expect(local.notes.join('\n')).toMatch(/not for one anyone else downloads/);
  });

  it('points at the right certificate when none is installed', () => {
    const plan = signingPlan({ hasDeveloperId: false, env: PROFILE });
    expect(plan.ok).toBe(false);
    // The commonest wrong turn is installing a development certificate.
    expect(plan.problems.join('\n')).toMatch(/Developer ID Application/);
    expect(plan.problems.join('\n')).toMatch(/Mac Development/);
  });

  it('wants the password for a certificate handed to CI', () => {
    const withLink = { CSC_LINK: 'base64...', ...PROFILE };
    expect(signingPlan({ env: withLink }).problems.join('\n')).toMatch(/CSC_KEY_PASSWORD/);
    expect(signingPlan({ env: { ...withLink, CSC_KEY_PASSWORD: 'pw' } }).ok).toBe(true);
  });

  it('respects an explicit opt out of signing', () => {
    const plan = signingPlan({ ...WITH_CERT, env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
    expect(plan.signing).toMatch(/none/);
  });
});

describe('missingEntitlements', () => {
  const plist = (keys) =>
    `<?xml version="1.0"?><plist version="1.0"><dict>${keys
      .map((k) => `<key>${k}</key><true/>`)
      .join('')}</dict></plist>`;

  it('accepts a bundle carrying all of them', () => {
    expect(missingEntitlements(plist(REQUIRED_ENTITLEMENTS))).toEqual([]);
  });

  it('catches the AppleScript one, which breaks a feature rather than the app', () => {
    const without = REQUIRED_ENTITLEMENTS.filter(
      (k) => k !== 'com.apple.security.automation.apple-events'
    );
    expect(missingEntitlements(plist(without))).toEqual([
      'com.apple.security.automation.apple-events',
    ]);
  });

  it('reports every key when the entitlements file never reached the signature', () => {
    expect(missingEntitlements('')).toEqual(REQUIRED_ENTITLEMENTS);
  });

  it('does not count a key that is present but false', () => {
    const xml = plist(REQUIRED_ENTITLEMENTS).replace(
      '<key>com.apple.security.cs.allow-jit</key><true/>',
      '<key>com.apple.security.cs.allow-jit</key><false/>'
    );
    expect(missingEntitlements(xml)).toEqual(['com.apple.security.cs.allow-jit']);
  });

  it('reads the real entitlements file as satisfying its own requirements', async () => {
    // Guards against the list and the plist drifting apart: either one alone
    // is a build that signs with less than it needs.
    const { readFileSync } = await import('node:fs');
    expect(missingEntitlements(readFileSync('build/entitlements.mac.plist', 'utf8'))).toEqual([]);
  });
});
