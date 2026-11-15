import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_BACKGROUND } from './types';

describe('resolveTheme', () => {
  it('is dark unless asked otherwise, as the workspace was designed', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('honours an explicit light choice whatever the OS prefers', () => {
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('follows the OS when set to system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('has a canvas colour for every theme it can resolve to', () => {
    expect(THEME_BACKGROUND.dark).toMatch(/^#[0-9A-F]{6}$/i);
    expect(THEME_BACKGROUND.light).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
