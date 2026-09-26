'use client';

import { cn } from '@/lib/utils';

export interface VersionItem {
  v: number;
  note: string;
  dateLabel: string;
  current: boolean;
}

export interface VersionTimelineProps {
  /** Newest first. */
  versions: readonly VersionItem[];
  selected: number;
  onSelect: (v: number) => void;
  className?: string;
}

/** Item p 10/10/10/8 r10 · dot 9 with a 2px ring · 13/500 label · 12 faint date. */
export function VersionTimeline({ versions, selected, onSelect, className }: VersionTimelineProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {versions.map((item) => {
        const on = item.v === selected;
        return (
          <button
            key={item.v}
            type="button"
            data-version-item=""
            data-version={item.v}
            onClick={() => onSelect(item.v)}
            aria-current={on ? 'true' : undefined}
            className={cn(
              'flex items-start gap-12 rounded-10 border-0 py-10 pr-10 pl-8 text-left hover:bg-surface2',
              on ? 'bg-surface2' : 'bg-transparent',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-6 h-9 w-9 shrink-0 rounded-circle border-2',
                on ? 'border-accent bg-accent' : 'border-line2 bg-surface',
              )}
            />
            <span className="flex min-w-0 flex-col gap-2">
              <span className="text-13 font-medium text-text">
                <span className="font-mono">{`v${item.v}`}</span>
                {` · ${item.note}`}
              </span>
              <span className="text-12 text-faint">
                {item.dateLabel}
                {item.current ? ' · hiện tại' : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
