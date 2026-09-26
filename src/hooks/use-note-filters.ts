'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifiedNavigate, type NavigateOptions } from '@/lib/nav/navigate';
import type { FilterChipDescriptor } from '@/components/shared';
import { usePrefs } from '@/hooks/use-prefs';
import {
  filtersTitle, nextFilters, parseNoteFilters, toHref,
  type FilterPatch, type NoteFilters,
} from '@/lib/nav/filters';
import type { ViewKey } from '@/lib/nav/paths';
import { PRIORITY_LABEL } from '@/lib/types';

/**
 * The navigation half of the dashboard filter state. The parsing half lives in
 * `@/lib/nav/filters`, which has no `'use client'` marker so the server
 * component can call it; importing it from here would put it behind the client
 * boundary and break SSR.
 */
export interface UseNoteFilters {
  filters: NoteFilters;
  /**
   * Discrete control → `push`, so Back undoes exactly one deliberate action.
   *
   * `scroll` mặc định false: thanh công cụ của dashboard nằm giữa trang, đổi
   * sắp xếp mà nhảy lên đầu thì giật. Thanh bên thì ngược lại — đó là danh
   * sách khác hẳn — nên nó truyền `{ scroll: true }`.
   */
  setFilters: (patch: FilterPatch, options?: NavigateOptions) => void;
  /** Typing → `replace`, so 20 keystrokes do not leave 20 history entries. */
  setQuery: (q: string) => void;
  setPage: (page: number) => void;
  /** Writes the URL *and* prefs; the URL wins on the next read (contracts §4). */
  setView: (view: ViewKey) => void;
  /** The prototype's `clearAll`: query, tag, priority and fav only. */
  clearAll: (options?: NavigateOptions) => void;
  chips: FilterChipDescriptor[];
  title: string;
}

export function useNoteFilters(): UseNoteFilters {
  const go = useVerifiedNavigate();
  const sp = useSearchParams();
  const { prefs, setPrefs } = usePrefs();

  const filters = useMemo(() => parseNoteFilters(sp, prefs.view), [sp, prefs.view]);

  const navigate = useCallback(
    (next: NoteFilters, mode: 'push' | 'replace', options?: NavigateOptions) => {
      go(toHref(next), mode, options);
    },
    [go],
  );

  const setFilters = useCallback(
    (patch: FilterPatch, options?: NavigateOptions) =>
      navigate(nextFilters(filters, patch), 'push', options),
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
    (options?: NavigateOptions) =>
      navigate(nextFilters(filters, { q: '', tag: null, priority: null, fav: false }), 'push', options),
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
    // Yêu thích giờ cộng dồn với thẻ và mức ưu tiên, nên nó cũng cần đường tắt
    // riêng — không thì muốn bỏ nó phải bấm "Tất cả ghi chú" và mất luôn hai
    // bộ lọc kia.
    if (filters.fav) {
      out.push({ id: 'fav', label: 'Yêu thích', onRemove: () => setFilters({ fav: false }) });
    }
    return out;
  }, [filters.q, filters.priority, filters.tag, filters.fav, setFilters]);

  return { filters, setFilters, setQuery, setPage, setView, clearAll, chips, title: filtersTitle(filters) };
}
