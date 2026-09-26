'use client';

import { cn } from '@/lib/utils';
import { TagChip } from './tag-chip';

export interface TagInputProps {
  tags: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  /** Fired for Enter and for a trailing ",". */
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  /** Backspace on an empty field. */
  onRemoveLast: () => void;
  placeholder?: string;
  className?: string;
}

/** min-h 44 · p 8 · gap 6 · r10 · 1px --line · --surface. Enter or "," adds; Backspace pops. */
export function TagInput({
  tags, value, onValueChange, onAdd, onRemove, onRemoveLast, placeholder = 'Thêm thẻ…', className,
}: TagInputProps) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-wrap items-center gap-6 rounded-10 border border-line bg-surface p-8',
        className,
      )}
    >
      {tags.map((tag) => (
        <TagChip key={tag} name={tag} tone="soft" onRemove={() => onRemove(tag)} />
      ))}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label="Thêm thẻ"
        onChange={(e) => {
          const next = e.target.value;
          if (next.endsWith(',')) onAdd(next);
          else onValueChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd(value);
          } else if (e.key === 'Backspace' && value === '' && tags.length > 0) {
            onRemoveLast();
          }
        }}
        className="h-26 min-w-90 flex-1 border-0 bg-transparent text-13 text-text outline-none placeholder:text-faint"
      />
    </div>
  );
}
