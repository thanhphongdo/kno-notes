import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type PillTone = 'hi' | 'med' | 'low' | 'ok' | 'accent' | 'neutral';

const TONE: Record<PillTone, string> = {
  hi: 'bg-hi-soft text-hi',
  med: 'bg-med-soft text-med',
  low: 'bg-low-soft text-low',
  ok: 'bg-ok-soft text-ok',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-surface2 text-muted',
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

export function Pill({ className, tone = 'neutral', ...rest }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-26 items-center gap-6 rounded-full px-10 text-12 font-medium',
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
