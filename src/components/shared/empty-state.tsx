'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** py-80 px-24, 1px dashed --line2, r14; title Serif 22/600; action h36 px-14 r8 bordered. */
export function EmptyState({ title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div
      data-empty-state=""
      className={cn(
        'flex flex-col items-center gap-10 rounded-14 border border-dashed border-line2 px-24 py-80 text-center',
        className,
      )}
    >
      <div className="font-serif text-22 font-semibold">{title}</div>
      {description ? <div className="text-14 text-muted">{description}</div> : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" size="36" radius="8" onClick={onAction} className="mt-8 border-line2 px-14">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
