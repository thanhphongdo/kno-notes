import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EditorClient } from '@/components/features/editor/editor-client';
import { getSession } from '@/lib/auth';
import { loginPath } from '@/lib/nav/paths';
import { listTags } from '@/lib/services/tags';

export const metadata: Metadata = { title: 'Ghi chú mới' };
export const dynamic = 'force-dynamic';

export default async function NewNotePage() {
  const session = await getSession();
  if (!session) redirect(loginPath());

  const tags = await listTags(session.id);

  return (
    <EditorClient
      draft={{
        id: null,
        title: '',
        desc: '',
        tags: [],
        priority: 'medium',
        images: [],
        content: '',
        changeNote: '',
      }}
      nextVersion={1}
      allTags={tags.map((t) => t.name)}
    />
  );
}
