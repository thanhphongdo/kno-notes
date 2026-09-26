'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Generates the range sentence itself: `Hiển thị {from}–{to} trên {total}`. */
export function Pagination({ page, pageCount, total, pageSize, onPageChange, className }: PaginationProps) {
  if (total <= 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-16 pt-8', className)}>
      <div className="text-13 text-muted">{`Hiển thị ${from}–${to} trên ${total}`}</div>
      {pageCount > 1 ? (
        <nav aria-label="Phân trang" className="flex items-center gap-4">
          <IconButton
            icon="chevron-left"
            label="Trang trước"
            variant="bordered"
            size={36}
            radius="8"
            tone="default"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={cn(page <= 1 && 'opacity-35')}
          />
          {pages.map((n) => {
            const current = n === page;
            return (
              <button
                key={n}
                type="button"
                aria-label={`Trang ${n}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => onPageChange(n)}
                className={cn(
                  'h-36 min-w-36 rounded-8 border-0 px-6 font-mono text-13 font-medium',
                  current
                    ? 'bg-text text-bg'
                    : 'bg-transparent text-muted hover:outline hover:outline-1 hover:outline-line2',
                )}
              >
                {n}
              </button>
            );
          })}
          <IconButton
            icon="chevron-right"
            label="Trang sau"
            variant="bordered"
            size={36}
            radius="8"
            tone="default"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className={cn(page >= pageCount && 'opacity-35')}
          />
        </nav>
      ) : null}
    </div>
  );
}
