import { cn } from '@/lib/utils';

/** First two letters of the display name, uppercased with Vietnamese locale rules. */
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toLocaleUpperCase('vi-VN');
}

export interface AvatarProps {
  name: string;
  /** 32 = sidebar footer, 30 = comment list. */
  size?: 32 | 30;
  className?: string;
}

export function Avatar({ name, size = 32, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-circle bg-surface2 font-semibold text-muted',
        size === 32 ? 'h-32 w-32 text-13' : 'h-30 w-30 text-11',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
