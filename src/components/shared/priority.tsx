'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/ui/pill';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';

export type Priority = 'high' | 'medium' | 'low';

export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};

export const PRIORITY_CLASS: Record<Priority, { dot: string; text: string; pill: string }> = {
  high: { dot: 'bg-hi', text: 'text-hi', pill: 'bg-hi-soft text-hi' },
  medium: { dot: 'bg-med', text: 'text-med', pill: 'bg-med-soft text-med' },
  low: { dot: 'bg-low', text: 'text-low', pill: 'bg-low-soft text-low' },
};

const DOT_SIZE = { 6: 'h-6 w-6', 7: 'h-7 w-7', 8: 'h-8 w-8' } as const;

export interface PriorityDotProps extends HTMLAttributes<HTMLSpanElement> {
  priority: Priority;
  size?: 6 | 7 | 8;
}

export function PriorityDot({ priority, size = 8, className, ...rest }: PriorityDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-circle', DOT_SIZE[size], PRIORITY_CLASS[priority].dot, className)}
      {...rest}
    />
  );
}

export interface PriorityLabelProps {
  priority: Priority;
  className?: string;
}

/** Card header: 7px dot + "Cao" in the priority colour, 12/500. */
export function PriorityLabel({ priority, className }: PriorityLabelProps) {
  return (
    <span className={cn('inline-flex items-center gap-6 text-12 font-medium', PRIORITY_CLASS[priority].text, className)}>
      <PriorityDot priority={priority} size={7} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export interface PriorityPillProps {
  priority: Priority;
  className?: string;
}

/** Detail header: "Ưu tiên cao" on the soft background, 6px dot, h26. */
export function PriorityPill({ priority, className }: PriorityPillProps) {
  return (
    <Pill className={cn(PRIORITY_CLASS[priority].pill, className)}>
      <PriorityDot priority={priority} size={6} />
      {`Ưu tiên ${PRIORITY_LABEL[priority].toLocaleLowerCase('vi-VN')}`}
    </Pill>
  );
}

export interface PrioritySegmentedProps {
  value: Priority;
  onChange: (value: Priority) => void;
  className?: string;
}

const PRIORITY_SEGMENTS: readonly SegmentedOption<Priority>[] = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABEL[p],
  dotClassName: PRIORITY_CLASS[p].dot,
}));

/** Editor panel: 3-column track, gap 4, p 4, --surface2, r10; items h34 r7. */
export function PrioritySegmented({ value, onChange, className }: PrioritySegmentedProps) {
  return (
    <Segmented
      options={PRIORITY_SEGMENTS}
      value={value}
      onChange={onChange}
      ariaLabel="Mức ưu tiên"
      columns={3}
      className={className}
    />
  );
}
