#!/usr/bin/env node
/**
 * Check a built mac app the way a stranger's Mac will.
 *
 *   node scripts/verify-signing.mjs                     # finds the build in release/
 *   node scripts/verify-signing.mjs path/to/app-or.dmg
 *
 * "It built" and "it opens on someone else's Mac" are different claims, and
 * the gap between them is invisible on the machine that did the building: the
 * strict Gatekeeper check only runs on a file that arrived with a quarantine
 * flag, so a broken signature opens perfectly well here and is refused
 * everywhere else. Every check below is one of the ways that happens —
 * entitlements silently dropped, notarization skipped with a warning nobody
 * read, a ticket that was never stapled so the app needs the network to open.
 *
 * Exits non-zero on the first thing a user would hit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { missingEntitlements, REQUIRED_ENTITLEMENTS } from '../packaging/signing.mjs';

const RELEASE_DIR = 'release';

/** Capture a command's output without throwing; signing tools use stderr. */
function run(file, args) {
  try {
    const stdout = execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: stdout };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return { ok: false, out: out || String(error.message ?? error) };
  }
}

/** The .app inside release/, or the .dmg if that is all there is. */
function findBuild() {
  if (!existsSync(RELEASE_DIR)) return null;
  const macDirs = readdirSync(RELEASE_DIR).filter((n) => n.startsWith('mac'));
  for (const dir of macDirs) {
    const inner = path.join(RELEASE_DIR, dir);
    const app = readdirSync(inner).find((n) => n.endsWith('.app'));
    if (app) return path.join(inner, app);
  }
  const dmg = readdirSync(RELEASE_DIR).find((n) => n.endsWith('.dmg'));
  return dmg ? path.join(RELEASE_DIR, dmg) : null;
}

const target = process.argv[2] ?? findBuild();
if (!target) {
  console.error(`Nothing to check: pass a path, or build first so ${RELEASE_DIR}/ exists.`);
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`No such file: ${target}`);
  process.exit(2);
}
if (process.platform !== 'darwin') {
  console.error('This check needs macOS: codesign, spctl and stapler are only there.');
  process.exit(2);
}

console.log(`Checking ${target}\n`);
const failures = [];
const isApp = target.endsWith('.app');

// 1. The signature is intact and covers everything in the bundle. --deep is
// what catches an unsigned helper or framework inside an otherwise fine app.
const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', target]);
if (verify.ok) console.log('✓ signature valid (codesign --deep --strict)');
else failures.push(`codesign --verify failed:\n${verify.out.trim()}`);

// 2. Signed by a Developer ID, not ad-hoc. An ad-hoc signature ("-") is what
// electron-builder falls back to with no certificate, and it looks signed.
const authority = run('codesign', ['-dvv', target]);
const authorityLine = /Authority=(.+)/.exec(authority.out)?.[1]?.trim();
if (authorityLine?.startsWith('Developer ID Application')) {
  console.log(`✓ signed by ${authorityLine}`);
} else {
  failures.push(
    `Not signed by a Developer ID Application certificate (authority: ${
      authorityLine ?? 'none — the signature is ad-hoc'
    }). Gatekeeper refuses this.`
  );
}

// 3. The hardened runtime is on; without it Apple will not notarize.
if (/flags=.*runtime/.test(authority.out)) console.log('✓ hardened runtime enabled');
else if (isApp) failures.push('The hardened runtime is not enabled; notarization requires it.');

// 4. The entitlements actually reached the bundle. A wrong path in
// package.json drops all of them silently, and the AppleScript one failing
// breaks the Terminal button rather than the app, so nobody notices in a smoke
// test.
if (isApp) {
  const ents = run('codesign', ['-d', '--entitlements', ':-', target]);
  const absent = missingEntitlements(ents.out);
  if (absent.length === 0) {
    console.log(`✓ all ${REQUIRED_ENTITLEMENTS.length} required entitlements present`);
  } else {
    failures.push(`Entitlements missing from the signed app: ${absent.join(', ')}`);
  }
}

// 5. Notarized and stapled. Stapling is the difference between opening offline
// and needing Apple reachable on first launch.
const staple = run('xcrun', ['stapler', 'validate', target]);
if (staple.ok) console.log('✓ notarization ticket stapled');
else failures.push(`No stapled notarization ticket:\n${staple.out.trim()}`);

// 6. The verdict Gatekeeper itself gives.
const assessType = isApp ? 'execute' : 'install';
const spctl = run('spctl', ['--assess', '--type', assessType, '-vv', target]);
if (spctl.ok && /accepted/.test(spctl.out))
  console.log(`✓ Gatekeeper accepts it (${spctl.out.trim().split('\n')[0]})`);
else failures.push(`Gatekeeper rejects it:\n${spctl.out.trim()}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`✗ ${f}\n`);
  process.exit(1);
}
console.log('\nThis build will open on a Mac that has never seen it before.');
