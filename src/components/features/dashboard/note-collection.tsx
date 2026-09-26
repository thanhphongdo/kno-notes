'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  EmptyState, NoteGrid, NoteList, Pagination, type NoteSummary,
} from '@/components/shared';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useNoteFilters } from '@/hooks/use-note-filters';
import { PAGE_SIZE } from '@/lib/nav/filters';
import { notePath } from '@/lib/nav/paths';
import { useOffline } from '@/components/providers/offline-provider';
import { isNetworkFailure } from '@/lib/offline/queue';

export interface NoteCollectionProps {
  /** The current page, already mapped to the shared card shape on the server. */
  notes: readonly NoteSummary[];
  total: number;
  pages: number;
  /**
   * The page the server actually served. It differs from the one in the URL
   * when a deep link asks for a page that does not exist, and it — not the
   * URL — is what the pager must show.
   */
  page: number;
}

const hrefFor = (note: NoteSummary) => notePath(note.id);

/**
 * The note list itself: grid or list per the URL, the prototype's empty state,
 * and pagination. Favourites are optimistic — the star flips immediately, the
 * server is told, and `router.refresh()` re-runs the server component so a
 * `fav=1` filter stays honest. A rejected write rolls the star back.
 */
export function NoteCollection({ notes, total, pages, page }: NoteCollectionProps) {
  const { filters, setPage, clearAll } = useNoteFilters();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const offline = useOffline();

  const onToggleFavorite = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      const current = overrides[id] ?? note?.favorite ?? false;
      setOverrides((m) => ({ ...m, [id]: !current }));
      void (async () => {
        const path = `/api/notes/${encodeURIComponent(id)}/favorite`;
        try {
          const res = await fetch(path, { method: 'POST' });
          if (!res.ok) throw new Error('favorite failed');
          startTransition(() => router.refresh());
        } catch (error) {
          // Mất mạng thì giữ nguyên sao vừa bấm và xếp hàng gửi sau; máy chủ
          // từ chối thì mới trả sao về như cũ.
          const queued =
            isNetworkFailure(error) &&
            (await offline?.queueWrite({
              kind: 'note.favorite',
              path,
              method: 'POST',
              body: null,
              label: `Yêu thích “${note?.title ?? id}”`,
              noteId: id,
            }));
          if (!queued) setOverrides((m) => ({ ...m, [id]: current }));
        }
      })();
    },
    [notes, offline, overrides, router],
  );

  if (notes.length === 0) {
    return (
      <EmptyState
        title="Không tìm thấy ghi chú"
        description={
          <>
            Thử từ khoá khác, hoặc tìm theo thẻ với cú pháp <span className="font-mono">#thẻ</span>.
          </>
        }
        actionLabel="Xoá bộ lọc"
        onAction={clearAll}
      />
    );
  }

  const withOverrides = notes.map((n) => ({ ...n, favorite: overrides[n.id] ?? n.favorite }));

  return (
    <>
      {filters.view === 'grid' ? (
        <NoteGrid notes={withOverrides} hrefFor={hrefFor} onToggleFavorite={onToggleFavorite} />
      ) : (
        <NoteList
          notes={withOverrides}
          wrap={isMobile}
          hrefFor={hrefFor}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      <Pagination
        page={page}
        pageCount={pages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </>
  );
}
