/**
 * What a mac build is about to do about signing and notarization, decided
 * before it starts rather than discovered at the end.
 *
 * A universal mac build takes minutes, and electron-builder signs and
 * notarizes as the very last step. A credential that is missing or in a
 * combination it cannot use therefore fails after all the expensive work, with
 * an error about a property name rather than about what to go and do. This
 * module is the same decision made up front, so `npm run sign:preflight` can
 * refuse in a second and say which thing to fix.
 *
 * It is a pure function so the awkward cases can be tested — in particular the
 * one real trap, below, which is otherwise only discovered by hitting it.
 */

/**
 * The order electron-builder itself checks credentials in, which is what makes
 * one shadow another: see getNotarizeOptions in app-builder-lib's macPackager.
 * Reproduced rather than referenced because being wrong about the order would
 * make this whole module lie confidently.
 */
const APP_PASSWORD_VARS = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD'];
const API_KEY_VARS = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];

const set = (env, name) => typeof env[name] === 'string' && env[name].trim() !== '';
const anySet = (env, names) => names.some((n) => set(env, n));
const missing = (env, names) => names.filter((n) => !set(env, n));

/**
 * @param {object} input
 * @param {Record<string, string | undefined>} input.env - usually process.env.
 * @param {boolean} input.hasDeveloperId - whether a "Developer ID Application"
 *   identity is in the keychain. Impure to discover, so it is passed in.
 * @param {boolean} [input.release] - true when the output is going to other
 *   people, which is what makes an unnotarized build a failure rather than a
 *   note: Gatekeeper judges a downloaded app, not a locally built one.
 * @returns {{ ok: boolean, signing: string, notarizing: string,
 *   problems: string[], notes: string[] }}
 */
export function signingPlan({ env = {}, hasDeveloperId = false, release = false } = {}) {
  const problems = [];
  const notes = [];

  const autoDiscovery = (env.CSC_IDENTITY_AUTO_DISCOVERY ?? '').toLowerCase() !== 'false';
  const suppliedCert = set(env, 'CSC_LINK');
  const canSign = suppliedCert || (hasDeveloperId && autoDiscovery);

  let signing;
  if (suppliedCert) {
    signing = 'CSC_LINK (a certificate supplied to the build)';
    if (!set(env, 'CSC_KEY_PASSWORD')) {
      problems.push(
        'CSC_LINK is set but CSC_KEY_PASSWORD is not. A .p12 is always ' +
          'password-protected, so the build cannot open it.'
      );
    }
  } else if (!autoDiscovery) {
    signing = 'none (CSC_IDENTITY_AUTO_DISCOVERY=false)';
  } else if (hasDeveloperId) {
    signing = 'Developer ID Application certificate from the keychain';
  } else {
    signing = 'none (no Developer ID Application certificate found)';
    problems.push(
      'No "Developer ID Application" certificate in the keychain. Create one at ' +
        'https://developer.apple.com/account/resources/certificates — pick ' +
        'Developer ID Application, upload a CSR from Keychain Access, then ' +
        'double-click the downloaded .cer to install it. Note that a "Mac ' +
        'Development" or "Apple Development" certificate is not the same thing ' +
        'and cannot be used to ship.'
    );
  }

  // Notarization, in electron-builder's own order of precedence.
  let notarizing = 'none';
  if (anySet(env, APP_PASSWORD_VARS)) {
    // The trap. electron-builder's `notarize: true` builds notarytool options
    // from APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD but never reads a team id
    // from the environment, and notarytool's password path requires one — so
    // this combination always fails, and it fails last, and the message names
    // a JSON property the user never wrote. Refuse it here instead.
    notarizing = 'none (unusable combination)';
    problems.push(
      'APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD cannot be used directly: ' +
        "electron-builder's `notarize: true` does not pass a team id, and " +
        'notarytool requires one with an app-specific password, so the build ' +
        'would fail after signing. Store the same credentials in the keychain ' +
        'once instead:\n' +
        '    xcrun notarytool store-credentials mvpfy-notary \\\n' +
        '      --apple-id "<your Apple ID>" \\\n' +
        '      --team-id "<your 10-character team ID>" \\\n' +
        '      --password "<app-specific password>"\n' +
        '  then unset APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD and export ' +
        'APPLE_KEYCHAIN_PROFILE=mvpfy-notary.'
    );
    if (set(env, 'APPLE_KEYCHAIN_PROFILE')) {
      notes.push(
        'APPLE_KEYCHAIN_PROFILE is set but would be ignored: APPLE_ID is ' +
          'checked first and shadows it. Unset APPLE_ID to use the profile.'
      );
    }
  } else if (anySet(env, API_KEY_VARS)) {
    const absent = missing(env, API_KEY_VARS);
    if (absent.length > 0) {
      notarizing = 'none (incomplete App Store Connect key)';
      problems.push(
        `An App Store Connect API key is partly configured; ${absent.join(' and ')} ` +
          'is missing. All of APPLE_API_KEY (the path to the .p8), ' +
          'APPLE_API_KEY_ID and APPLE_API_ISSUER are required together.'
      );
    } else {
      notarizing = 'App Store Connect API key';
    }
  } else if (set(env, 'APPLE_KEYCHAIN_PROFILE')) {
    notarizing = `notarytool keychain profile "${env.APPLE_KEYCHAIN_PROFILE}"`;
  } else if (release) {
    problems.push(
      'Nothing is configured to notarize the build. An app that is signed but ' +
        'not notarized is still refused by Gatekeeper once it has been ' +
        'downloaded, so this would ship broken. Set APPLE_KEYCHAIN_PROFILE ' +
        '(see `xcrun notarytool store-credentials`) or the three APPLE_API_* ' +
        'variables.'
    );
  } else {
    notes.push(
      'No notarization credentials: fine for a local build, not for one anyone ' + 'else downloads.'
    );
  }

  if (!canSign && notarizing !== 'none' && !notarizing.startsWith('none')) {
    problems.push(
      'Notarization is configured but the app will not be signed, and Apple ' +
        'only notarizes a signed app. Fix the certificate first.'
    );
  }

  return { ok: problems.length === 0, signing, notarizing, problems, notes };
}

/**
 * What build/entitlements.mac.plist has to end up granting on the built app.
 *
 * Checked against the real bundle rather than trusted, because the path to the
 * plist is a string in package.json: get it wrong and electron-builder signs
 * with no entitlements at all and says nothing. The app then launches fine for
 * whoever built it — the quarantine flag is what triggers the strict check —
 * and fails for everybody who downloads it.
 */
export const REQUIRED_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.allow-dyld-environment-variables',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.automation.apple-events',
];

/**
 * @param {string} plistXml - output of `codesign -d --entitlements :- <app>`.
 * @returns {string[]} the required keys that are absent or not set true.
 */
export function missingEntitlements(plistXml) {
  const text = String(plistXml);
  return REQUIRED_ENTITLEMENTS.filter((key) => {
    // <key>name</key> followed by <true/>, allowing for whitespace and the
    // single-line form that codesign sometimes emits.
    const pattern = new RegExp(`<key>${key.replace(/\./g, '\\.')}</key>\\s*<true\\s*/>`);
    return !pattern.test(text);
  });
}
