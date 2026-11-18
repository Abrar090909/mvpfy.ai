#!/usr/bin/env node
/**
 * Say what a mac build will do about signing, and refuse if it would fail.
 *
 *   node scripts/sign-preflight.mjs            # a local build
 *   node scripts/sign-preflight.mjs --release  # one other people will download
 *
 * The decision itself lives in packaging/signing.mjs; this is the part that
 * has to touch the keychain, which is why it is separate.
 */
import { execFileSync } from 'node:child_process';
import { signingPlan } from '../packaging/signing.mjs';

/** Whether a Developer ID Application identity exists and is valid. */
function hasDeveloperId() {
  if (process.platform !== 'darwin') return false;
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
    });
    return out.includes('Developer ID Application');
  } catch {
    // No keychain, or security is unavailable: treat as no certificate rather
    // than as an error, so this still runs on a machine that cannot sign.
    return false;
  }
}

const release = process.argv.includes('--release');
const plan = signingPlan({ env: process.env, hasDeveloperId: hasDeveloperId(), release });

console.log(`Signing:      ${plan.signing}`);
console.log(`Notarization: ${plan.notarizing}`);
for (const note of plan.notes) console.log(`\nNote: ${note}`);
for (const problem of plan.problems) console.error(`\nProblem: ${problem}`);

if (!plan.ok) {
  console.error(
    `\nRefusing to start ${release ? 'a release' : 'this'} build: it would fail at the end.`
  );
  process.exit(1);
}
console.log('\nReady.');
