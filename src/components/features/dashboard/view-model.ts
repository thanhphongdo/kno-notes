import type { NoteSummary as CardSummary } from '@/components/shared';
import { rel } from '@/lib/text';
import type { NoteSummary } from '@/lib/types';

/**
 * The domain summary (`@/lib/types`) and the card summary (`@/components/shared`)
 * differ in three places only: `fav` → `favorite`, `updated` → a `rel()` label,
 * and `latestVersion` → `version`. Doing the conversion on the server keeps
 * `rel()` out of the client bundle and keeps the rendered label stable across
 * hydration.
 *
 * `now` is threaded through so tests can pin the clock.
 */
export function toNoteCardSummary(note: NoteSummary, now?: number): CardSummary {
  return {
    id: note.id,
    title: note.title,
    desc: note.desc,
    priority: note.priority,
    tags: note.tags,
    favorite: note.fav,
    updatedLabel: rel(note.updated, now),
    version: note.latestVersion,
    imageCount: note.imageCount,
    commentCount: note.commentCount,
  };
}
