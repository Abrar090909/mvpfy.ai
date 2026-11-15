import { useEffect } from 'react';
import { resolveTheme, ThemeChoice } from '../../shared/types';

/**
 * Where the last theme shown is remembered for the next launch's first paint.
 * The real setting lives in state.json, which arrives over IPC a moment after
 * the page starts drawing; without this a light-mode user saw the dark canvas
 * flash before their theme arrived.
 */
const FIRST_PAINT_KEY = 'mvpfy-theme';

const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

/** Puts a theme on the page: one attribute, which every colour token reads. */
export function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(FIRST_PAINT_KEY, theme);
  } catch {
    // Storage refused (a locked-down profile): the setting still applies.
  }
}

/** Called before React mounts, with whatever the last launch showed. */
export function applyRememberedTheme(): void {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(FIRST_PAINT_KEY);
  } catch {
    // Nothing remembered; the default (dark) stands.
  }
  if (remembered === 'light' || remembered === 'dark') {
    document.documentElement.dataset.theme = remembered;
  }
}

/** Keeps the page on the chosen theme, following the OS live for 'system'. */
export function useTheme(choice: ThemeChoice | undefined): void {
  useEffect(() => {
    applyTheme(resolveTheme(choice, prefersLight()));
    if (choice !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const follow = () => applyTheme(resolveTheme('system', query.matches));
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [choice]);
}

/** The opposite of what is showing now — the sidebar's one-click switch. */
export function toggledTheme(choice: ThemeChoice | undefined): 'dark' | 'light' {
  return resolveTheme(choice, prefersLight()) === 'dark' ? 'light' : 'dark';
}
