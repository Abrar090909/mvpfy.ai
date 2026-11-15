import { describe, expect, it } from 'vitest';
import { isSamePage, isWebUrl } from './urls';

describe('isWebUrl', () => {
  it('allows plain web links', () => {
    expect(isWebUrl('https://github.com/acme/shop/pull/4')).toBe(true);
    expect(isWebUrl('http://127.0.0.1:5173/')).toBe(true);
  });

  it('refuses anything the OS would hand to another program', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'ms-msdt:/id PCWDiagnostic',
      'search-ms:query=x',
      'javascript:alert(1)',
      'vscode://file/etc/passwd',
      'smb://attacker/share',
      'not a url',
      '',
    ]) {
      expect(isWebUrl(url), url).toBe(false);
    }
  });
});

describe('isSamePage', () => {
  it('treats a hash or query change as the same page', () => {
    expect(isSamePage('http://localhost:5173/', 'http://localhost:5173/#settings')).toBe(true);
    expect(isSamePage('file:///app/dist/index.html', 'file:///app/dist/index.html?x=1')).toBe(true);
  });

  it('treats another origin or document as leaving the app', () => {
    expect(isSamePage('http://localhost:5173/', 'https://evil.example/')).toBe(false);
    expect(isSamePage('file:///app/dist/index.html', 'file:///etc/passwd')).toBe(false);
  });
});
