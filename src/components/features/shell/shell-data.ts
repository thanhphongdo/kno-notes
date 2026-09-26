/* Server-only: imports the database client, never reachable from a client component. */
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { listTags } from '@/lib/services/tags';

export interface SidebarCounts {
  all: number;
  favorite: number;
  high: number;
  medium: number;
  low: number;
}

export interface ShellNavData {
  user: { displayName: string; username: string };
  counts: SidebarCounts;
  tags: { name: string; slug: string; count: number }[];
}

const MAX_SCAN = 5000;

/**
 * The five badge numbers in the sidebar, in one round trip.
 *
 * PROVISIONAL: this belongs in `src/lib/services/` next to `listTags`, and the
 * backend agent has been asked for a `counts(userId)` there. Until it exists
 * this reads `note_index` directly — scoped by `user_id` like every other read
 * in the app, and only the two columns the badges need.
 */
export async function sidebarCounts(userId: string): Promise<SidebarCounts> {
  const rows = await db
    .select({ priority: noteIndex.priority, favorite: noteIndex.favorite })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(MAX_SCAN);

  const counts: SidebarCounts = { all: rows.length, favorite: 0, high: 0, medium: 0, low: 0 };
  for (const row of rows) {
    if (row.favorite) counts.favorite += 1;
    counts[row.priority] += 1;
  }
  return counts;
}

/** Everything the sidebar renders, fetched server-side in the `(app)` layout. */
export async function getShellNavData(user: {
  id: string;
  displayName: string;
  username: string;
}): Promise<ShellNavData> {
  const [counts, tags] = await Promise.all([sidebarCounts(user.id), listTags(user.id)]);
  return { user: { displayName: user.displayName, username: user.username }, counts, tags };
}
