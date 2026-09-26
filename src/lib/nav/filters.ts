/**
 * The dashboard's filter state, as read from and written to the query string
 * (contracts §4). Deliberately free of React and of `'use client'`: the
 * dashboard page parses the URL on the server, and the hook in
 * `@/hooks/use-note-filters` only adds the navigation behaviour on top.
 *
 * Nothing here may throw on a hand-edited URL. Every enum falls back to its
 * default and `page` is clamped, so `/?page=999&sort=bogus&priority=purple&view=table`
 * renders the first page of the default sort instead of a 500.
 */
import { DEFAULT_PAGE_SIZE, PRIORITY_LABEL } from '@/lib/types';
import { buildDashboardHref, type PriorityKey, type SortKey, type ViewKey } from './paths';

/** Matches `DEFAULT_PAGE_SIZE` — the server paginates by the same number. */
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

export type FilterPatch = Partial<NoteFilters>;

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

/** Anything with `.get()`: a real `URLSearchParams`, or Next's readonly wrapper. */
export interface ReadableParams {
  get(name: string): string | null;
}

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

/** Server helper: Next hands a page a `Record`, not a `URLSearchParams`. */
export function searchParamsFrom(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') sp.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === 'string') sp.set(key, value[0]);
  }
  return sp;
}

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

/**
 * Tiêu đề của danh sách đang xem.
 *
 * Prototype chỉ có `viewTitle` chọn MỘT mặt lọc theo thứ tự ưu tiên, vì lúc đó
 * thanh bên thay bộ lọc chứ không cộng dồn. Giờ thẻ và mức ưu tiên lọc được
 * cùng lúc, nên tiêu đề phải kể đủ — nếu không nó nói dối về danh sách bên
 * dưới. Một mặt lọc duy nhất vẫn ra đúng chuỗi cũ.
 */
export function filtersTitle(f: NoteFilters): string {
  if (f.q.trim()) return 'Kết quả tìm kiếm';
  const parts = [
    f.fav ? 'Yêu thích' : null,
    f.tag ? `#${f.tag}` : null,
    f.priority ? `Ưu tiên ${PRIORITY_LABEL[f.priority].toLowerCase()}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Tất cả ghi chú';
}
