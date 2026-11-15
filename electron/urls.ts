/**
 * Pure URL rules behind the navigation guards in security.ts, kept apart from
 * `electron` so they can be tested without loading it.
 */

/** A URL that is safe to hand to the user's browser or load in a pane. */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Same document the window was loaded with, give or take a hash or query. */
export function isSamePage(current: string, next: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(next);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
