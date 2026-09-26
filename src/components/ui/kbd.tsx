import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** No border/background — used for the "Enter" hint in the search panel. */
  bare?: boolean;
}

export function Kbd({ className, bare = false, ...rest }: KbdProps) {
  return (
    <span
      className={cn(
        'font-mono text-11 text-faint',
        !bare && 'rounded-5 border border-line px-6 py-1',
        className,
      )}
      {...rest}
    />
  );
}
