// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseNoteFilters } from './query';
import { DEFAULT_PAGE_SIZE } from '@/lib/types';

const parse = (qs: string) => parseNoteFilters(new URL(`http://x/api/notes${qs}`).searchParams);

describe('parseNoteFilters', () => {
  it(`defaults to all notes, updated sort, page 1, size ${DEFAULT_PAGE_SIZE}`, () => {
    expect(parse('')).toEqual({
      query: '',
      nav: 'all',
      priority: null,
      tag: null,
      sort: 'updated',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('reads the query string as-is, including a leading #', () => {
    expect(parse('?q=%23Tim%20m%E1%BA%A1ch').query).toBe('#Tim mạch');
  });

  it('maps fav=1, fav=true and nav=fav to the favourites view', () => {
    expect(parse('?fav=1').nav).toBe('fav');
    expect(parse('?fav=true').nav).toBe('fav');
    expect(parse('?nav=fav').nav).toBe('fav');
    expect(parse('?fav=0').nav).toBe('all');
    expect(parse('?fav=false').nav).toBe('all');
  });

  it('accepts only the three known priorities', () => {
    expect(parse('?priority=high').priority).toBe('high');
    expect(parse('?priority=low').priority).toBe('low');
    expect(parse('?priority=urgent').priority).toBeNull();
    expect(parse('?priority=').priority).toBeNull();
  });

  it('accepts only the three known sorts, falling back to updated', () => {
    expect(parse('?sort=title').sort).toBe('title');
    expect(parse('?sort=priority').sort).toBe('priority');
    expect(parse('?sort=random').sort).toBe('updated');
  });

  it('clamps page to at least 1 and ignores junk', () => {
    expect(parse('?page=3').page).toBe(3);
    expect(parse('?page=0').page).toBe(1);
    expect(parse('?page=-5').page).toBe(1);
    expect(parse('?page=abc').page).toBe(1);
  });

  it(`clamps pageSize to 1..100 and defaults to ${DEFAULT_PAGE_SIZE}`, () => {
    expect(parse('?pageSize=12').pageSize).toBe(12);
    expect(parse('?pageSize=0').pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parse('?pageSize=5000').pageSize).toBe(100);
    expect(parse('?pageSize=xyz').pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('passes the tag through untouched so display casing survives', () => {
    expect(parse('?tag=Tim%20m%E1%BA%A1ch').tag).toBe('Tim mạch');
    expect(parse('?tag=').tag).toBeNull();
  });
});
