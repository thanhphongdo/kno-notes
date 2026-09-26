'use client';

import { cn } from '@/lib/utils';
import { NoteCard, type NoteItemHandlers, type NoteSummary } from './note-card';

export interface NoteGridProps extends NoteItemHandlers {
  notes: readonly NoteSummary[];
  /** Builds the deep link for each card. Omit to fall back to `onOpen`. */
  hrefFor?: (note: NoteSummary) => string;
  className?: string;
}

/** grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap 16. */
export function NoteGrid({ notes, hrefFor, onOpen, onToggleFavorite, className }: NoteGridProps) {
  return (
    <div
      className={cn('grid gap-16', className)}
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
    >
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          href={hrefFor?.(note)}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
