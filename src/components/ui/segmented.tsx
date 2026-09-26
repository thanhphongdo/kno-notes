'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icon';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label?: ReactNode;
  icon?: IconName;
  iconSize?: number;
  /** Tailwind bg-* class for the leading 7px dot (priority segmented). */
  dotClassName?: string;
  /** Accessible name when there is no text label. */
  title?: string;
}

export interface SegmentedProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /**
   * `track`    = p-4 gap-4 bg-surface2 rounded-10, items h-34 rounded-7 (theme, priority)
   * `bordered` = p-3 gap-2 border-line bg-surface rounded-9, items h-28 w-30 rounded-6 (view toggle)
   */
  variant?: 'track' | 'bordered';
  columns?: number;
  className?: string;
}

export function Segmented<T extends string = string>({
  options, value, onChange, ariaLabel, variant = 'track', columns, className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        columns ? 'grid' : 'flex',
        variant === 'track' && 'gap-4 rounded-10 bg-surface2 p-4',
        variant === 'bordered' && 'gap-2 rounded-9 border border-line bg-surface p-3',
        className,
      )}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={opt.title ?? undefined}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            data-value={opt.value}
            className={cn(
              'flex items-center justify-center gap-6 border-0 font-medium transition-colors duration-150',
              variant === 'track' && 'h-34 rounded-7 text-13',
              variant === 'bordered' && 'h-28 w-30 rounded-6',
              on
                ? variant === 'track'
                  ? 'bg-surface text-text shadow-seg'
                  : 'bg-surface2 text-text'
                : variant === 'track'
                  ? 'bg-transparent text-muted'
                  : 'bg-transparent text-faint',
            )}
          >
            {opt.dotClassName ? (
              <span aria-hidden="true" className={cn('h-7 w-7 shrink-0 rounded-circle', opt.dotClassName)} />
            ) : null}
            {opt.icon ? <Icon name={opt.icon} size={opt.iconSize ?? 15} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
