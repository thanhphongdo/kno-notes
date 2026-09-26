'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

export interface TagChipProps {
  name: string;
  /** `card` = py-3 px-9 (note card / list row); `md` = h-26 px-10 (everywhere else). */
  size?: 'card' | 'md';
  /** `neutral` surface2/muted · `soft` accent-soft/accent (editor) · `dashed` suggestion. */
  tone?: 'neutral' | 'soft' | 'dashed';
  hash?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  count?: number;
  className?: string;
}

export function TagChip({
  name, size = 'md', tone = 'neutral', hash = false, onClick, onRemove, count, className,
}: TagChipProps) {
  const label = hash ? `#${name}` : name;

  const base = cn(
    'inline-flex max-w-full items-center gap-6 overflow-hidden rounded-full text-12 whitespace-nowrap text-ellipsis',
    tone !== 'dashed' && 'border-0',
    size === 'card' ? 'px-9 py-3' : 'h-26 px-10',
    tone === 'neutral' && 'bg-surface2 text-muted',
    tone === 'soft' && 'bg-accent-soft font-medium text-accent',
    tone === 'dashed' && 'border border-dashed border-line2 bg-transparent text-muted',
    onClick && 'transition-colors duration-150 hover:text-accent',
    tone === 'dashed' && onClick && 'hover:border-accent',
    onRemove && 'gap-4 pr-4',
    className,
  );

  const body = (
    <>
      <span className="overflow-hidden text-ellipsis">{label}</span>
      {count != null ? <span className="font-mono text-faint">{count}</span> : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Gỡ thẻ ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex h-18 w-18 shrink-0 items-center justify-center rounded-circle border-0 bg-transparent p-0 text-inherit"
        >
          <Icon name="close" size={10} strokeWidth={2.6} />
        </button>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {body}
      </button>
    );
  }
  return <span className={base}>{body}</span>;
}
