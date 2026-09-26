import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EditorClient } from '@/components/features/editor/editor-client';
import { getSession } from '@/lib/auth';
import { loginPath } from '@/lib/nav/paths';
import { getNote } from '@/lib/services/notes';
import { listTags } from '@/lib/services/tags';
import type { Note } from '@/lib/types';

export const metadata: Metadata = { title: 'Chỉnh sửa ghi chú' };
export const dynamic = 'force-dynamic';

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect(loginPath());

  const { id } = await params;
  const [note, tags] = await Promise.all([
    getNote(session.id, id).catch((): Note | null => null),
    listTags(session.id),
  ]);
  if (!note) notFound();

  const latest = note.versions[note.versions.length - 1]?.v ?? 1;

  return (
    <EditorClient
      draft={{
        id: note.id,
        title: note.title,
        desc: note.desc,
        tags: [...note.tags],
        priority: note.priority,
        images: note.images.map((im) => ({ id: im.id, label: im.label, src: im.src })),
        content: note.content,
        changeNote: '',
      }}
      nextVersion={latest + 1}
      allTags={tags.map((t) => t.name)}
    />
  );
}
