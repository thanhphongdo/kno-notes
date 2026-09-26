import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS max-height, e.g. `min(480px, 72vh)` for the search suggestion panel. */
  maxHeight?: string;
}

/**
 * Native overflow, matching the prototype's plain `overflow-y: auto`. Deliberately
 * NOT Radix ScrollArea — Radix replaces the OS scrollbar and would not match.
 */
export function ScrollArea({ className, maxHeight, style, ...rest }: ScrollAreaProps) {
  return <div className={cn('min-h-0 overflow-y-auto', className)} style={{ maxHeight, ...style }} {...rest} />;
}
