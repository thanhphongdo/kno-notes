import { describe, expect, it } from 'vitest';
import { ACCENTS, FS_DEFAULT, FS_MAX, FS_MIN, THEMES, applyPrefs, clampFontSize } from './theme';

describe('clampFontSize', () => {
  it('passes through in-range integers', () => {
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(17)).toBe(17);
    expect(clampFontSize(22)).toBe(22);
  });

  it('clamps out-of-range numbers to the 14–22 bounds', () => {
    expect(clampFontSize(0)).toBe(FS_MIN);
    expect(clampFontSize(-5)).toBe(FS_MIN);
    expect(clampFontSize(99)).toBe(FS_MAX);
  });

  it('falls back to the default for non-numbers, NaN and null', () => {
    expect(clampFontSize('abc')).toBe(FS_DEFAULT);
    expect(clampFontSize(Number.NaN)).toBe(FS_DEFAULT);
    expect(clampFontSize(null)).toBe(FS_DEFAULT);
    expect(clampFontSize(undefined)).toBe(FS_DEFAULT);
  });

  it('rounds fractional values', () => {
    expect(clampFontSize(17.6)).toBe(18);
  });
});

describe('theme constants', () => {
  it('offers exactly two themes and three accents', () => {
    expect(THEMES).toEqual(['light', 'dark']);
    expect(ACCENTS).toEqual(['teal', 'indigo', 'plum']);
  });
});

describe('applyPrefs', () => {
  it('writes theme, accent and --fs onto <html>', () => {
    applyPrefs({ theme: 'dark', accent: 'plum', fontSize: 21 });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.accent).toBe('plum');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('21px');
  });

  it('normalises unknown values back to light / teal / default size', () => {
    applyPrefs({});
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(document.documentElement.style.getPropertyValue('--fs')).toBe('17px');
  });
});
