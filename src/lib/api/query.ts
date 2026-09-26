// src/lib/api/query.ts
import {
  DEFAULT_PAGE_SIZE,
  PRIORITIES,
  type NoteFilters,
  type Priority,
  type SortKey,
} from '@/lib/types';

const SORTS: SortKey[] = ['updated', 'priority', 'title'];

function int(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * `pageSize` khác `page`: giá trị 0 hoặc rác phải rơi về 6 (mặc định),
 * KHÔNG bị kẹp thành 1 — nên không dùng chung `int()`.
 */
function pageSize(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, 100);
}

/** Đọc filter từ query string. Mọi giá trị lạ đều rơi về mặc định, không 400. */
export function parseNoteFilters(sp: URLSearchParams): Required<NoteFilters> {
  const priority = sp.get('priority');
  const sort = sp.get('sort');
  const fav = sp.get('fav');
  const tag = sp.get('tag');

  return {
    query: sp.get('q') ?? '',
    nav: fav === '1' || fav === 'true' || sp.get('nav') === 'fav' ? 'fav' : 'all',
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : null,
    tag: tag && tag.length ? tag : null,
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : 'updated',
    page: int(sp.get('page'), 1, 1, 1_000_000),
    pageSize: pageSize(sp.get('pageSize')),
  };
}
