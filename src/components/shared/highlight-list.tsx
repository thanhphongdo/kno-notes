'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { HighlightSnippet } from './highlight-snippet';

export const HIGHLIGHT_EMPTY = 'Bôi đen một đoạn trong nội dung để đánh dấu.';

export interface HighlightItem {
  id: string;
  text: string;
}

export interface HighlightListProps {
  highlights: readonly HighlightItem[];
  onRemove: (id: string) => void;
  className?: string;
}

/** Serif 14/1.5 on --hl, r4, py 2 px 6, clamped to 3 lines; 24px remove button. */
export function HighlightList({ highlights, onRemove, className }: HighlightListProps) {
  if (highlights.length === 0) {
    return <div className={cn('text-13 leading-[1.5] text-muted', className)}>{HIGHLIGHT_EMPTY}</div>;
  }

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      {highlights.map((item) => (
        <div key={item.id} data-highlight-item="" className="flex items-start gap-8">
          <HighlightSnippet text={item.text} className="flex-1" />
          <IconButton
            icon="close"
            label="Bỏ đánh dấu"
            size={24}
            radius="6"
            iconSize={12}
            strokeWidth={2.2}
            tone="faint"
            hoverTone="hi"
            onClick={() => onRemove(item.id)}
          />
        </div>
      ))}
    </div>
  );
}
