'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { NoteItemRoot, type NoteItemHandlers, type NoteSummary } from './note-card';
import { PriorityDot } from './priority';
import { TagChip } from './tag-chip';

export interface NoteListRowProps extends NoteItemHandlers {
  note: NoteSummary;
  /** The first row has a transparent top border. */
  first?: boolean;
  /** Mobile: allow the row to wrap. */
  wrap?: boolean;
  /** When set the whole row becomes a `<Link>` to this URL. */
  href?: string;
  className?: string;
}

export function NoteListRow({
  note, first = false, wrap = false, href, onOpen, onToggleFavorite, className,
}: NoteListRowProps) {
  return (
    <NoteItemRoot
      hook="row"
      href={href}
      noteId={note.id}
      title={note.title}
      onOpen={onOpen}
      className={cn(
        'flex cursor-pointer items-center gap-16 border-t py-16 px-18 text-text no-underline hover:bg-surface2 hover:no-underline',
        first ? 'border-transparent' : 'border-line',
        wrap ? 'flex-wrap' : 'flex-nowrap',
        className,
      )}
    >
      <PriorityDot priority={note.priority} size={8} />

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        <div data-note-title="" className="truncate font-serif text-17 font-semibold leading-[1.3]">
          {note.title}
        </div>
        <div className="truncate text-13 text-muted">{note.desc}</div>
      </div>

      <div className="flex shrink-0 gap-6">
        {note.tags.slice(0, 3).map((tag) => (
          <TagChip key={tag} name={tag} size="card" />
        ))}
      </div>

      <div className="flex min-w-150 shrink-0 items-center justify-end gap-12 text-12 text-faint">
        {note.imageCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số hình ảnh">
            <Icon name="image" size={14} />
            {note.imageCount}
          </span>
        ) : null}
        {note.commentCount > 0 ? (
          <span className="flex items-center gap-4" aria-label="Số bình luận">
            <Icon name="comment" size={14} />
            {note.commentCount}
          </span>
        ) : null}
        <span className="whitespace-nowrap">{note.updatedLabel}</span>
      </div>

      <Toggle
        icon="star"
        label="Yêu thích"
        pressed={note.favorite}
        iconSize={17}
        strokeWidth={1.6}
        iconFilled={note.favorite}
        tone={note.favorite ? 'med' : 'faint'}
        size={32}
        radius="8"
        className="hover:bg-surface"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(note.id);
        }}
      />
    </NoteItemRoot>
  );
}
