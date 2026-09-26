'use client';

import { cn } from '@/lib/utils';
import type { NoteItemHandlers, NoteSummary } from './note-card';
import { NoteListRow } from './note-list-row';

export interface NoteListProps extends NoteItemHandlers {
  notes: readonly NoteSummary[];
  wrap?: boolean;
  /** Builds the deep link for each row. Omit to fall back to `onOpen`. */
  hrefFor?: (note: NoteSummary) => string;
  className?: string;
}

export function NoteList({ notes, wrap = false, hrefFor, onOpen, onToggleFavorite, className }: NoteListProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-14 border border-line bg-surface', className)}>
      {notes.map((note, i) => (
        <NoteListRow
          key={note.id}
          note={note}
          first={i === 0}
          wrap={wrap}
          href={hrefFor?.(note)}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
