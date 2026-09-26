'use client';

import { cn } from '@/lib/utils';
import { Icon } from './icon';

export interface ChipProps {
  label: string;
  onRemove: () => void;
  /** Accessible name for the remove affordance. Defaults to `Gỡ bộ lọc {label}`. */
  removeLabel?: string;
  className?: string;
}

/** Removable dashboard filter chip: h30, pl 12 / pr 8, rounded-full, 1px line. */
export function Chip({ label, onRemove, removeLabel, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel ?? `Gỡ bộ lọc ${label}`}
      className={cn(
        'inline-flex h-30 items-center gap-6 rounded-full border border-line bg-surface pl-12 pr-8 text-13 text-text transition-colors duration-150 hover:border-line2',
        className,
      )}
    >
      {label}
      <Icon name="close" size={12} strokeWidth={2.2} className="text-faint" />
    </button>
  );
}
