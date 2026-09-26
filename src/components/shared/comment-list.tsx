'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

export interface CommentAuthor {
  id: string;
  displayName: string;
}

export interface CommentItem {
  id: string;
  text: string;
  dateLabel: string;
  /** Contracts §3.3 — the app is multi-user, so every comment carries its author. */
  author: CommentAuthor;
}

export interface CommentListProps {
  comments: readonly CommentItem[];
  onRemove: (id: string) => void;
  className?: string;
}

/** Avatar 30 · gap 12 · meta 12 faint with a 13/500 name · body 15/1.6 pre-wrap. */
export function CommentList({ comments, onRemove, className }: CommentListProps) {
  return (
    <div className={cn('flex flex-col gap-20', className)}>
      {comments.map((comment) => (
        <div key={comment.id} data-comment="" data-comment-id={comment.id} className="flex gap-12">
          <Avatar name={comment.author.displayName} size={30} />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center gap-8 text-12 text-faint">
              <span className="text-13 font-medium text-text">{comment.author.displayName}</span>
              <span>{comment.dateLabel}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => onRemove(comment.id)}
                aria-label={`Xoá bình luận ${comment.dateLabel}`}
                className="border-0 bg-transparent p-0 text-12 text-faint hover:text-hi"
              >
                Xoá
              </button>
            </div>
            <div className="whitespace-pre-wrap break-words text-15 leading-[1.6]">{comment.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
