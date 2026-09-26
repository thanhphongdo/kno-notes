'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CommentComposer, CommentList } from '@/components/shared';
import { useToast } from '@/components/ui';
import { rel } from '@/lib/text';
import type { NoteComment } from '@/lib/types';

/** Legacy seed rows have no author; the UI shows "?" rather than a hard-coded name. */
const UNKNOWN_AUTHOR = { id: '', displayName: '?' } as const;

export interface CommentsSectionProps {
  noteId: string;
  comments: readonly NoteComment[];
}

/** Prototype lines 405-418 — the comment thread and its composer. */
export function CommentsSection({ noteId, comments }: CommentsSectionProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const base = `/api/notes/${encodeURIComponent(noteId)}/comments`;

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        flash('Không gửi được bình luận');
        return;
      }
      setDraft('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [base, busy, draft, flash, router]);

  const remove = useCallback(
    async (commentId: string) => {
      const res = await fetch(`${base}/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
      if (!res.ok) {
        flash('Không xoá được bình luận');
        return;
      }
      router.refresh();
    },
    [base, flash, router],
  );

  return (
    <section className="mt-56 flex flex-col gap-20 border-t border-line pt-28">
      <div className="text-15 font-semibold">
        Bình luận{' '}
        <span className="font-mono text-13 font-normal text-faint">{comments.length}</span>
      </div>
      <CommentList
        comments={comments.map((c) => ({
          id: c.id,
          text: c.text,
          dateLabel: rel(c.date),
          author: c.author ?? UNKNOWN_AUTHOR,
        }))}
        onRemove={(id) => void remove(id)}
      />
      <CommentComposer value={draft} onValueChange={setDraft} onSubmit={() => void submit()} />
    </section>
  );
}
