'use client';

import { FilterChips, SortSelect, ViewToggle } from '@/components/shared';
import { useNoteFilters } from '@/hooks/use-note-filters';

export interface DashboardToolbarProps {
  /** Total number of notes matching the current filters, from the server. */
  total: number;
}

/**
 * The dashboard head row: dynamic H1, result count, sort, view toggle and the
 * removable filter chips. Every control writes the URL through
 * `useNoteFilters`, which is the single owner of the push/replace and
 * page-reset rules (contracts §4).
 */
export function DashboardToolbar({ total }: DashboardToolbarProps) {
  const { filters, setFilters, setView, clearAll, chips, title } = useNoteFilters();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-16">
        <div className="flex flex-col gap-6">
          <h1 className="m-0 font-serif text-26 font-semibold leading-[1.15] tracking-[-.02em] min-[820px]:text-32">
            {title}
          </h1>
          <div className="text-14 text-muted">{`${total} ghi chú`}</div>
        </div>
        <div className="flex items-center gap-10">
          <SortSelect value={filters.sort} onChange={(sort) => setFilters({ sort })} />
          <ViewToggle value={filters.view} onChange={setView} />
        </div>
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} />
    </>
  );
}
