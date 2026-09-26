'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { usePrefs } from '@/hooks/use-prefs';
import { buildDashboardHref, type PriorityKey, type SortKey, type ViewKey } from '@/lib/nav/paths';
import { DEFAULT_PAGE_SIZE, PRIORITY_LABEL } from '@/lib/types';
import type { FilterChipDescriptor } from '@/components/shared';

/**
 * The dashboard's whole filter state is the query string (contracts §4).
 *
 * Nothing here is allowed to throw on a hand-edited URL: every enum falls back
 * to its default and `page` is clamped, so `/?page=999&sort=bogus&priority=purple&view=table`
 * renders the first page of the default sort instead of a 500.
 */

/** Matches `DEFAULT_PAGE_SIZE` in `@/lib/types` — the server paginates by the same number. */
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export interface NoteFilters {
  q: string;
  tag: string | null;
  priority: PriorityKey | null;
  fav: boolean;
  sort: SortKey;
  page: number;
  view: ViewKey;
}

export const DEFAULT_FILTERS: NoteFilters = {
  q: '',
  tag: null,
  priority: null,
  fav: false,
  sort: 'updated',
  page: 1,
  view: 'grid',
};

const SORTS: readonly string[] = ['updated', 'priority', 'title'];
const PRIORITIES: readonly string[] = ['high', 'medium', 'low'];
const VIEWS: readonly string[] = ['grid', 'list'];

/** Anything with `URLSearchParams.get` — the real thing, or Next's readonly wrapper. */
export type ReadableParams = URLSearchParams | ReadonlyURLSearchParams;

/**
 * `URLSearchParams.get()` — never `decodeURIComponent` — because
 * `buildDashboardHref` serialises a space as `+`, which only the former
 * decodes. Getting that wrong silently breaks every Vietnamese tag filter.
 */
export function parseNoteFilters(sp: ReadableParams, prefView?: ViewKey): NoteFilters {
  const rawSort = sp.get('sort') ?? '';
  const rawPriority = sp.get('priority') ?? '';
  const rawView = sp.get('view') ?? '';
  const rawPage = Number.parseInt(sp.get('page') ?? '', 10);
  const tag = (sp.get('tag') ?? '').trim();

  return {
    q: (sp.get('q') ?? '').trim(),
    tag: tag || null,
    priority: PRIORITIES.includes(rawPriority) ? (rawPriority as PriorityKey) : null,
    fav: sp.get('fav') === '1',
    sort: SORTS.includes(rawSort) ? (rawSort as SortKey) : DEFAULT_FILTERS.sort,
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_FILTERS.page,
    view: VIEWS.includes(rawView) ? (rawView as ViewKey) : (prefView ?? DEFAULT_FILTERS.view),
  };
}

/** Server helper: Next hands a page `Record`, not a `URLSearchParams`. */
export function searchParamsFrom(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') sp.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === 'string') sp.set(key, value[0]);
  }
  return sp;
}

export type FilterPatch = Partial<NoteFilters>;

/** Narrowing the result set always sends the reader back to page 1. */
const NARROWING_KEYS = ['q', 'tag', 'priority', 'fav', 'sort'] as const;

export function nextFilters(current: NoteFilters, patch: FilterPatch): NoteFilters {
  const merged: NoteFilters = { ...current, ...patch };
  const narrowed = NARROWING_KEYS.some((k) => k in patch && patch[k] !== current[k]);
  if (narrowed && !('page' in patch)) merged.page = 1;
  return merged;
}

/** The single serialiser — `buildDashboardHref` owns the param order and defaults. */
export function toHref(f: NoteFilters): string {
  return buildDashboardHref({
    q: f.q, tag: f.tag, priority: f.priority, fav: f.fav, sort: f.sort, page: f.page, view: f.view,
  });
}

/** The prototype's `viewTitle`, verbatim. */
export function filtersTitle(f: NoteFilters): string {
  if (f.q.trim()) return 'Kết quả tìm kiếm';
  if (f.tag) return `#${f.tag}`;
  if (f.priority) return `Ưu tiên ${PRIORITY_LABEL[f.priority].toLowerCase()}`;
  if (f.fav) return 'Yêu thích';
  return 'Tất cả ghi chú';
}

export interface UseNoteFilters {
  filters: NoteFilters;
  /** Discrete control → `push`, so Back undoes exactly one deliberate action. */
  setFilters: (patch: FilterPatch) => void;
  /** Typing → `replace`, so 20 keystrokes do not leave 20 history entries. */
  setQuery: (q: string) => void;
  setPage: (page: number) => void;
  /** Writes the URL *and* prefs; the URL wins on the next read (contracts §4). */
  setView: (view: ViewKey) => void;
  /** The prototype's `clearAll`: query, tag, priority and fav only. */
  clearAll: () => void;
  chips: FilterChipDescriptor[];
  title: string;
}

export function useNoteFilters(): UseNoteFilters {
  const router = useRouter();
  const sp = useSearchParams();
  const { prefs, setPrefs } = usePrefs();

  const filters = useMemo(() => parseNoteFilters(sp, prefs.view), [sp, prefs.view]);

  const navigate = useCallback(
    (next: NoteFilters, mode: 'push' | 'replace') => {
      const href = toHref(next);
      if (mode === 'replace') router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [router],
  );

  const setFilters = useCallback(
    (patch: FilterPatch) => navigate(nextFilters(filters, patch), 'push'),
    [filters, navigate],
  );

  const setQuery = useCallback(
    (q: string) => navigate(nextFilters(filters, { q }), 'replace'),
    [filters, navigate],
  );

  const setPage = useCallback(
    (page: number) => {
      navigate(nextFilters(filters, { page }), 'push');
      if (typeof window !== 'undefined') window.scrollTo(0, 0);
    },
    [filters, navigate],
  );

  const setView = useCallback(
    (view: ViewKey) => {
      setPrefs({ view });
      navigate(nextFilters(filters, { view }), 'push');
    },
    [filters, navigate, setPrefs],
  );

  const clearAll = useCallback(
    () => navigate(nextFilters(filters, { q: '', tag: null, priority: null, fav: false }), 'push'),
    [filters, navigate],
  );

  const chips = useMemo<FilterChipDescriptor[]>(() => {
    const out: FilterChipDescriptor[] = [];
    if (filters.q) {
      out.push({ id: 'q', label: `“${filters.q}”`, onRemove: () => setFilters({ q: '' }) });
    }
    if (filters.priority) {
      out.push({
        id: 'priority',
        label: `Ưu tiên ${PRIORITY_LABEL[filters.priority].toLowerCase()}`,
        onRemove: () => setFilters({ priority: null }),
      });
    }
    if (filters.tag) {
      out.push({ id: 'tag', label: `#${filters.tag}`, onRemove: () => setFilters({ tag: null }) });
    }
    return out;
  }, [filters.q, filters.priority, filters.tag, setFilters]);

  return { filters, setFilters, setQuery, setPage, setView, clearAll, chips, title: filtersTitle(filters) };
}
