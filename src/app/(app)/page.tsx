import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardToolbar } from '@/components/features/dashboard/dashboard-toolbar';
import { NoteCollection } from '@/components/features/dashboard/note-collection';
import { toNoteCardSummary } from '@/components/features/dashboard/view-model';
import { PAGE_SIZE, parseNoteFilters, searchParamsFrom } from '@/hooks/use-note-filters';
import { getSession } from '@/lib/auth';
import { loginPath } from '@/lib/nav/paths';
import { PREFS_COOKIE, parsePrefsCookie } from '@/lib/prefs';
import { listNotes } from '@/lib/services/notes';

export const metadata: Metadata = { title: 'Tất cả ghi chú' };
export const dynamic = 'force-dynamic';

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The dashboard renders on the server: the filters are read straight off the
 * query string and handed to `listNotes`, so a deep link is a complete
 * description of the page and the first paint already has the right notes.
 * The client components below only own the *controls* — they write the URL and
 * Next re-renders this component.
 *
 * `view` has no server-side query effect, but it decides grid-vs-list markup,
 * so the prefs cookie is read here too: the same source the `PrefsProvider` is
 * seeded from, which keeps the server and the first client render in step.
 */
export default async function DashboardPage({ searchParams }: Search) {
  const session = await getSession();
  if (!session) redirect(loginPath());

  const jar = await cookies();
  const prefs = parsePrefsCookie(jar.get(PREFS_COOKIE)?.value);
  const filters = parseNoteFilters(searchParamsFrom(await searchParams), prefs.view);

  const { notes, total, pages } = await listNotes(session.id, {
    query: filters.q,
    nav: filters.fav ? 'fav' : 'all',
    priority: filters.priority,
    tag: filters.tag,
    sort: filters.sort,
    page: filters.page,
    pageSize: PAGE_SIZE,
  });

  const now = Date.now();

  return (
    <div className="mx-auto flex w-full max-w-1160 flex-col gap-24 px-16 pt-20 pb-64 min-[820px]:px-40 min-[820px]:pt-36">
      <DashboardToolbar total={total} />
      <NoteCollection notes={notes.map((n) => toNoteCardSummary(n, now))} total={total} pages={pages} />
    </div>
  );
}
