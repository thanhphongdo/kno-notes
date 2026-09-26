'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface SidebarNavItemProps {
  label: string;
  count?: number;
  active?: boolean;
  /** Navigation is a callback — the feature layer calls `router.push()` inside it. */
  onClick: () => void;
  /** nav h38 · priority h34 · tag h32 — exactly as in the prototype. */
  variant?: 'nav' | 'priority' | 'tag';
  dotClassName?: string;
  hash?: boolean;
  className?: string;
}

export function SidebarNavItem({
  label, count, active = false, onClick, variant = 'nav', dotClassName, hash = false, className,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center rounded-8 border-0 px-10 text-left text-14 hover:bg-surface2',
        variant === 'nav' && 'h-38 justify-between',
        variant === 'priority' && 'h-34 gap-10',
        variant === 'tag' && 'h-32 gap-8',
        active ? 'bg-surface2 font-medium text-text' : 'bg-transparent font-normal text-muted',
        className,
      )}
    >
      {dotClassName ? (
        <span aria-hidden="true" className={cn('h-8 w-8 shrink-0 rounded-circle', dotClassName)} />
      ) : null}
      {hash ? <span aria-hidden="true" className="font-mono text-13 text-faint">#</span> : null}
      <span className={cn(variant === 'nav' ? '' : 'flex-1', variant === 'tag' && 'truncate')}>{label}</span>
      {count != null ? <Badge>{count}</Badge> : null}
    </button>
  );
}
