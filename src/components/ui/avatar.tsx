import { cn } from '@/lib/utils';

/** First two letters of the display name, uppercased with Vietnamese locale rules. */
/**
 * Word initials, like the prototype's `BS` for "Bác sĩ".
 *
 * Slicing the first two characters would give "BÁ" here, and "NG" for
 * "Nguyễn Văn An" — initials of the first and last word read as a name.
 * Falls back to the first two characters for a single-word name.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : (words[0][0] ?? '') + (words[words.length - 1][0] ?? '');
  return letters.toLocaleUpperCase('vi-VN');
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
