import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InfoGridItem {
  key: string;
  value: ReactNode;
}

export interface InfoGridProps {
  items: readonly InfoGridItem[];
  className?: string;
}

/** Detail rail "Thông tin": grid auto/1fr, gap 8 × 16, 13px, keys faint. */
export function InfoGrid({ items, className }: InfoGridProps) {
  return (
    <dl className={cn('m-0 grid grid-cols-[auto_1fr] gap-x-16 gap-y-8 text-13', className)}>
      {items.map((item) => (
        <div key={item.key} className="contents">
          <dt className="text-faint">{item.key}</dt>
          <dd className="m-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
