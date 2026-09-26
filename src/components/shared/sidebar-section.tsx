import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionLabel } from './section-label';

export interface SidebarSectionProps {
  label?: string;
  /** The tag list scrolls independently and absorbs the remaining height. */
  scroll?: boolean;
  children: ReactNode;
  className?: string;
}

export function SidebarSection({ label, scroll = false, children, className }: SidebarSectionProps) {
  return (
    <div className={cn('flex flex-col', label ? 'gap-6' : 'gap-2', scroll && 'min-h-0 flex-1', className)}>
      {label ? <SectionLabel size={11} className="px-10">{label}</SectionLabel> : null}
      <div className={cn('flex flex-col gap-2', scroll && 'min-h-0 overflow-y-auto')}>{children}</div>
    </div>
  );
}
