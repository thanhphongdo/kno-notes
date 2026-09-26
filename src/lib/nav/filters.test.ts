import { describe, expect, it } from 'vitest';
import { buildDashboardHref } from './paths';
import {
  DEFAULT_FILTERS, PAGE_SIZE, filtersTitle, nextFilters, parseNoteFilters, toHref,
} from './filters';

const sp = (s: string) => new URLSearchParams(s);

describe('parseNoteFilters', () => {
  it('returns the defaults for an empty query string', () => {
    expect(parseNoteFilters(sp(''))).toEqual(DEFAULT_FILTERS);
  });

  it('reads every supported parameter', () => {
    expect(
      parseNoteFilters(sp('q=sốc&tag=Cấp cứu&priority=high&fav=1&sort=title&page=3&view=list')),
    ).toEqual({
      q: 'sốc', tag: 'Cấp cứu', priority: 'high', fav: true, sort: 'title', page: 3, view: 'list',
    });
  });

  it('decodes a "+" in a tag as a space, the way buildDashboardHref encodes it', () => {
    const href = buildDashboardHref({ tag: 'Tim mạch' });
    expect(href).toBe('/?tag=Tim+m%E1%BA%A1ch');
    expect(parseNoteFilters(sp(href.slice(2))).tag).toBe('Tim mạch');
  });

  it('falls back on unknown enum values instead of crashing', () => {
    expect(parseNoteFilters(sp('sort=bogus&priority=purple&view=table'))).toEqual(DEFAULT_FILTERS);
  });

  it('clamps page to >= 1 and ignores non-numeric pages', () => {
    expect(parseNoteFilters(sp('page=0')).page).toBe(1);
    expect(parseNoteFilters(sp('page=-4')).page).toBe(1);
    expect(parseNoteFilters(sp('page=abc')).page).toBe(1);
    expect(parseNoteFilters(sp('page=999')).page).toBe(999);
  });

  it('survives the whole garbage deep link from the plan', () => {
    expect(parseNoteFilters(sp('page=999&sort=bogus&priority=purple&view=table'))).toEqual({
      ...DEFAULT_FILTERS, page: 999,
    });
  });

  it('uses the prefs view only when the URL has none', () => {
    expect(parseNoteFilters(sp(''), 'list').view).toBe('list');
    expect(parseNoteFilters(sp('view=grid'), 'list').view).toBe('grid');
    expect(parseNoteFilters(sp('view=table'), 'list').view).toBe('list');
  });

  it('treats fav=0 and a missing fav identically', () => {
    expect(parseNoteFilters(sp('fav=0')).fav).toBe(false);
    expect(parseNoteFilters(sp('fav=1')).fav).toBe(true);
  });

  it('trims the query and treats a blank tag as absent', () => {
    expect(parseNoteFilters(sp('q=  &tag=')).q).toBe('');
    expect(parseNoteFilters(sp('tag=')).tag).toBeNull();
  });
});

describe('toHref', () => {
  it('round-trips through buildDashboardHref, dropping every default', () => {
    expect(toHref(DEFAULT_FILTERS)).toBe('/');
    expect(toHref({ ...DEFAULT_FILTERS, sort: 'title' })).toBe('/?sort=title');
    expect(parseNoteFilters(new URLSearchParams(toHref({
      ...DEFAULT_FILTERS, q: 'sốc', tag: 'Tim mạch', priority: 'low', fav: true, page: 4, view: 'list',
    }).slice(2)))).toEqual({
      q: 'sốc', tag: 'Tim mạch', priority: 'low', fav: true, sort: 'updated', page: 4, view: 'list',
    });
  });
});

describe('nextFilters', () => {
  const base = { ...DEFAULT_FILTERS, page: 4 };

  it.each([
    ['q', { q: 'x' }],
    ['tag', { tag: 'y' }],
    ['priority', { priority: 'low' as const }],
    ['fav', { fav: true }],
    ['sort', { sort: 'title' as const }],
  ])('resets page to 1 when %s changes', (_key, patch) => {
    expect(nextFilters(base, patch).page).toBe(1);
  });

  it('keeps the page when only the page changes', () => {
    expect(nextFilters(base, { page: 7 }).page).toBe(7);
  });

  it('keeps the page when only the view changes (contracts §4 asymmetry)', () => {
    expect(nextFilters(base, { view: 'list' }).page).toBe(4);
  });

  it('does not reset the page when a filter is set to the value it already has', () => {
    expect(nextFilters({ ...base, sort: 'title' }, { sort: 'title' }).page).toBe(4);
  });
});

describe('filtersTitle', () => {
  it('mirrors the prototype precedence', () => {
    expect(filtersTitle({ ...DEFAULT_FILTERS, q: 'hen', tag: 'ECG' })).toBe('Kết quả tìm kiếm');
    expect(filtersTitle({ ...DEFAULT_FILTERS, tag: 'ECG', priority: 'high' })).toBe('#ECG');
    expect(filtersTitle({ ...DEFAULT_FILTERS, priority: 'medium', fav: true })).toBe('Ưu tiên trung bình');
    expect(filtersTitle({ ...DEFAULT_FILTERS, fav: true })).toBe('Yêu thích');
    expect(filtersTitle(DEFAULT_FILTERS)).toBe('Tất cả ghi chú');
  });
});

describe('PAGE_SIZE', () => {
  it('matches the backend default page size', () => {
    expect(PAGE_SIZE).toBe(6);
  });
});
