import { cn } from '@/lib/utils';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Not present in the prototype — used only for async states the prototype does
 * not cover (e.g. a save in flight). Quiz loading uses SkeletonGroup instead.
 */
export function Spinner({ size = 16, className, label = 'Đang tải' }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      className={cn('animate-spin text-accent', className)}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".2" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
