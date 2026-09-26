import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Wraps its control below the text with a 6px gap (login form pattern). */
  stacked?: boolean;
}

export function Label({ className, stacked = false, ...rest }: LabelProps) {
  return (
    <label
      className={cn('text-13 font-medium text-muted', stacked && 'flex flex-col gap-6', className)}
      {...rest}
    />
  );
}
