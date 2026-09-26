import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RADIUS_CLASS, type Radius } from './button';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: Radius;
}

export function Skeleton({ className, radius = '6', ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('bg-surface2', RADIUS_CLASS[radius], className)} {...rest} />;
}

export interface SkeletonGroupProps {
  children: ReactNode;
  label: string;
  className?: string;
}

/** The prototype animates the WRAPPER, not each bar: `qpulse 1.4s ease-in-out infinite`. */
export function SkeletonGroup({ children, label, className }: SkeletonGroupProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn('flex flex-col gap-10 animate-[qpulse_1.4s_ease-in-out_infinite]', className)}
    >
      {children}
    </div>
  );
}
