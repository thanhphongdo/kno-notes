import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'faint' | 'muted';
}

/** Mono counter: sidebar counts, card version label, comment count. */
export function Badge({ className, tone = 'faint', ...rest }: BadgeProps) {
  return (
    <span
      className={cn('font-mono text-12', tone === 'faint' ? 'text-faint' : 'text-muted', className)}
      {...rest}
    />
  );
}
