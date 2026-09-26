import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DetailClient } from '@/components/features/note/detail-client';
import { getSession } from '@/lib/auth';
import { getNote } from '@/lib/services/notes';
import type { Note } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `getNote` throws a 404 HttpError; the page turns that into Next's notFound(). */
async function loadNote(userId: string, id: string): Promise<Note | null> {
  try {
    return await getNote(userId, id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: 'Ghi chú' };
  const note = await loadNote(session.id, (await params).id);
  return { title: note?.title ?? 'Ghi chú' };
}

export default async function NoteDetailPage({ params, searchParams }: Params & Search) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const note = await loadNote(session.id, id);
  if (!note) notFound();

  const rawV = (await searchParams).v;
  const wanted = typeof rawV === 'string' ? Number.parseInt(rawV, 10) : Number.NaN;
  const latestVersion = note.versions[note.versions.length - 1]?.v ?? 1;
  const picked = note.versions.find((v) => v.v === wanted);
  const viewingOld = Boolean(picked) && wanted !== latestVersion;

  return (
    <DetailClient
      data={{
        note,
        shownContent: viewingOld && picked ? picked.content : note.content,
        viewingOld,
        selectedVersion: viewingOld && picked ? picked.v : latestVersion,
        latestVersion,
      }}
    />
  );
}
