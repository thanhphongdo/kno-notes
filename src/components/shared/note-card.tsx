'use client';

import Link from 'next/link';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Toggle } from '@/components/ui/toggle';
import { PriorityLabel, type Priority } from './priority';
import { TagChip } from './tag-chip';

export const MAX_CARD_TAGS = 3;

export interface NoteSummary {
  id: string;
  title: string;
  desc: string;
  priority: Priority;
  /** The card shows at most `MAX_CARD_TAGS`. */
  tags: readonly string[];
  favorite: boolean;
  /** Already formatted by `rel()`. */
  updatedLabel: string;
  /** Rendered as `v{version}` in mono. */
  version: number;
  imageCount: number;
  commentCount: number;
}

export interface NoteItemHandlers {
  /**
   * Called when the item is activated. Ignored when `href` is supplied — the
   * `<Link>` handles navigation then (contracts §2.3).
   */
  onOpen?: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

interface NoteItemRootProps {
  href?: string;
  noteId: string;
  title: string;
  onOpen?: (id: string) => void;
  className: string;
  /** `data-note-card` or `data-note-row`. */
  hook: 'card' | 'row';
  children: ReactNode;
}

/**
 * Contracts §2.3 — the ONE navigation exception. With `href` the root renders a
 * Next.js `<Link>` carrying exactly the same classes; without it, a `<div>` with
 * button semantics that calls `onOpen`.
 */
export function NoteItemRoot({ href, noteId, title, onOpen, className, hook, children }: NoteItemRootProps) {
  const hooks = hook === 'card' ? { 'data-note-card': '' } : { 'data-note-row': '' };

  if (href) {
    return (
      <Link href={href} aria-label={title} data-note-id={noteId} {...hooks} className={className}>
        {children}
      </Link>
    );
  }

  const activate = () => onOpen?.(noteId);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      data-note-id={noteId}
      {...hooks}
      onClick={activate}
      onKeyDown={onKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}

export interface NoteCardProps extends NoteItemHandlers {
  note: NoteSummary;
  /** When set the whole card becomes a `<Link>` to this URL. */
  href?: string;
  className?: string;
}

export function NoteCard({ note, href, onOpen, onToggleFavorite, className }: NoteCardProps) {
  return (
    <NoteItemRoot
      hook="card"
      href={href}
      noteId={note.id}
      title={note.title}
      onOpen={onOpen}
      className={cn(
        'flex min-h-200 cursor-pointer flex-col gap-10 rounded-14 border border-line bg-surface pt-18 px-20 pb-16 text-text no-underline',
        'transition-[border-color,box-shadow] duration-150 hover:border-line2 hover:shadow-card hover:no-underline',
        className,
      )}
    >
      <div className="flex h-28 items-center justify-between gap-8">
        <PriorityLabel priority={note.priority} />
        <Toggle
          icon="star"
          label="Yêu thích"
          pressed={note.favorite}
          iconSize={18}
          strokeWidth={1.6}
          iconFilled={note.favorite}
          tone={note.favorite ? 'med' : 'faint'}
          size={32}
          radius="8"
          className="-mr-8"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(note.id);
          }}
        />
      </div>

      <div
        data-note-title=""
        className="break-words font-serif text-20 font-semibold leading-[1.3] tracking-[-.01em] [text-wrap:pretty]"
      >
        {note.title}
      </div>

      <div className="line-clamp-2 break-words text-14 leading-[1.55] text-muted">{note.desc}</div>

      <div className="flex-1" />

      <div className="flex flex-wrap gap-6">
        {note.tags.slice(0, MAX_CARD_TAGS).map((tag) => (
          <TagChip key={tag} name={tag} size="card" />
        ))}
      </div>

      <div className="flex items-center gap-14 border-t border-line pt-12 text-12 text-faint">
        <span className="flex-1 truncate">{note.updatedLabel}</span>
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
        <Badge>{`v${note.version}`}</Badge>
      </div>
    </NoteItemRoot>
  );
}
