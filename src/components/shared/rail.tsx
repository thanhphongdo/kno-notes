import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionLabel } from './section-label';

export interface RailProps extends HTMLAttributes<HTMLElement> {
  /** Detail rail is sticky at top 88 on desktop; editor rail is static. */
  sticky?: boolean;
  /** flex-basis: 260 = detail, 280 = editor. */
  basis?: 260 | 280;
}

export function Rail({ className, sticky = false, basis = 260, children, ...rest }: RailProps) {
  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col gap-28',
        basis === 260 ? 'flex-[1_1_260px]' : 'flex-[1_1_280px]',
        'max-[819px]:static max-[819px]:max-w-full',
        sticky ? 'min-[820px]:sticky min-[820px]:top-88 min-[820px]:max-w-300' : 'min-[820px]:max-w-300',
        className,
      )}
      {...rest}
    >
      {children}
    </aside>
  );
}

export interface RailSectionProps {
  label: string;
  /** Right-aligned affordance next to the label, e.g. the "+ Làm bài" link. */
  action?: ReactNode;
  children: ReactNode;
  /** The first section has no top divider. */
  first?: boolean;
  className?: string;
}

export function RailSection({ label, action, children, first = false, className }: RailSectionProps) {
  return (
    <section className={cn('flex flex-col gap-10', !first && 'border-t border-line pt-20', className)}>
      {action ? (
        <div className="flex items-center justify-between">
          <SectionLabel>{label}</SectionLabel>
          {action}
        </div>
      ) : (
        <SectionLabel>{label}</SectionLabel>
      )}
      {children}
    </section>
  );
}
