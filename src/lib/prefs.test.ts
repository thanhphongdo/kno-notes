import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  PREFS_COOKIE,
  parsePrefsCookie,
  pushRecent,
  serializePrefsCookie,
  toClientPrefs,
} from './prefs';

describe('parsePrefsCookie', () => {
  it('returns the defaults for undefined, empty and malformed input', () => {
    expect(parsePrefsCookie(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('')).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('not-json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie('%7B%22theme%22%3A')).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie(encodeURIComponent('null'))).toEqual(DEFAULT_PREFS);
    expect(parsePrefsCookie(encodeURIComponent('[1,2]'))).toEqual(DEFAULT_PREFS);
  });

  it('falls back field by field when the values are the wrong type', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        theme: 'neon',
        fontSize: 'huge',
        view: 'table',
        sidebarCollapsed: 'yes',
        recentSearches: 'x',
      }),
    );
    expect(parsePrefsCookie(raw)).toEqual(DEFAULT_PREFS);
  });

  it('clamps fontSize into 14..22', () => {
    const at = (fontSize: number) =>
      parsePrefsCookie(encodeURIComponent(JSON.stringify({ fontSize }))).fontSize;
    expect(at(99)).toBe(22);
    expect(at(2)).toBe(14);
    expect(at(20.4)).toBe(20);
  });

  it('round-trips a valid value', () => {
    const p = {
      theme: 'dark' as const,
      fontSize: 21,
      view: 'list' as const,
      sidebarCollapsed: true,
      recentSearches: ['sốc phản vệ', '#Tim mạch'],
    };
    expect(parsePrefsCookie(serializePrefsCookie(p))).toEqual(p);
  });

  it('keeps at most 5 recent searches and drops duplicates', () => {
    const raw = encodeURIComponent(
      JSON.stringify({ ...DEFAULT_PREFS, recentSearches: ['a', 'b', 'a', 'c', 'd', 'e', 'f'] }),
    );
    expect(parsePrefsCookie(raw).recentSearches).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('pushRecent', () => {
  it('puts the newest first, keeps entries unique and caps the list at 5', () => {
    expect(pushRecent(['a', 'sốc', 'b', 'c', 'd'], 'sốc')).toEqual(['sốc', 'a', 'b', 'c', 'd']);
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });

  it('ignores an empty or whitespace-only term and trims the rest', () => {
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
    expect(pushRecent(['a'], '')).toEqual(['a']);
    expect(pushRecent(['a'], '  sốc  ')).toEqual(['sốc', 'a']);
  });
});

describe('toClientPrefs', () => {
  it('strips userId and normalises the stored row', () => {
    expect(
      toClientPrefs({
        userId: 'u1',
        theme: 'dark',
        fontSize: 40,
        view: 'list',
        sidebarCollapsed: true,
        recentSearches: ['a', 'a', 'b'],
      }),
    ).toEqual({
      theme: 'dark',
      fontSize: 22,
      view: 'list',
      sidebarCollapsed: true,
      recentSearches: ['a', 'b'],
    });
  });
});

describe('PREFS_COOKIE', () => {
  it('is the name the server layout reads', () => {
    expect(PREFS_COOKIE).toBe('kn_prefs');
  });
});
