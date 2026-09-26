'use client';

import { cn } from '@/lib/utils';
import { TagChip } from './tag-chip';

export const MAX_TAG_SUGGESTIONS = 6;

export interface TagSuggestionsProps {
  tags: readonly string[];
  onAdd: (tag: string) => void;
  className?: string;
}

/** Dashed 26px chips, "+ Tên", max six — exactly the prototype's `suggest` list. */
export function TagSuggestions({ tags, onAdd, className }: TagSuggestionsProps) {
  const shown = tags.slice(0, MAX_TAG_SUGGESTIONS);
  if (shown.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-6', className)}>
      {shown.map((tag) => (
        <TagChip key={tag} name={`+ ${tag}`} tone="dashed" onClick={() => onAdd(tag)} />
      ))}
    </div>
  );
}
