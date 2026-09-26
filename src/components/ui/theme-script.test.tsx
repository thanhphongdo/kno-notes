import { beforeEach, describe, expect, it } from 'vitest';
import { PREFS_KEY } from '@/lib/theme';
import { themeScriptSource } from './theme-script';

function runScript() {
  new Function(themeScriptSource)();
}

describe('themeScriptSource', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
    document.documentElement.style.removeProperty('--fs');
  });

  it('defaults to light / teal / 17px with no stored prefs', () => {
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');
  });

  it('restores a stored dark theme, accent and font size before paint', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'dark', accent: 'plum', fontSize: 21 }));
    runScript();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.accent).toBe('plum');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('21px');
  });

  it('clamps a corrupt font size instead of rendering 0px or NaN', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 0 }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('14px');

    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 'abc' }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');

    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: null }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');

    localStorage.setItem(PREFS_KEY, JSON.stringify({ fontSize: 99 }));
    runScript();
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('22px');
  });

  it('survives unparseable storage and still sets light', () => {
    localStorage.setItem(PREFS_KEY, '{not json');
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('rejects an unknown theme value', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'neon' }));
    runScript();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
