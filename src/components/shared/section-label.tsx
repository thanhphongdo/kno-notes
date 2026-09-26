import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  /** 11 = sidebar group headings; 12 = detail rail / editor panel / quiz. */
  size?: 11 | 12;
}

export function SectionLabel({ className, size = 12, ...rest }: SectionLabelProps) {
  return (
    <div
      className={cn(
        'font-semibold uppercase tracking-[.08em] text-faint',
        size === 11 ? 'text-11' : 'text-12',
        className,
      )}
      {...rest}
    />
  );
}
