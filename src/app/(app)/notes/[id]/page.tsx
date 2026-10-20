import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DetailClient } from '@/components/features/note/detail-client';
import { getSession } from '@/lib/auth';
import { isNotFound } from '@/lib/http';
import { getNote } from '@/lib/services/notes';
import type { Note } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * `getNote` ném 404 khi không có ghi chú; trang đổi nó thành `notFound()`.
 *
 * Mọi lỗi khác được NÉM TIẾP, có chủ ý: file đọc không được, GitHub trả lỗi,
 * JSON hỏng — những cái đó không phải "ghi chú không tồn tại". Hiện trang 404
 * cho chúng vừa nói dối người dùng là bài đã mất, vừa nuốt mất stack trace nên
 * không còn gì để lần ra nguyên nhân. Để nó nổi lên: error boundary hiện
 * "Không mở được ghi chú", và log máy chủ giữ lại lỗi thật.
 */
async function loadNote(userId: string, id: string): Promise<Note | null> {
  try {
    return await getNote(userId, id);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: 'Ghi chú' };
  try {
    const note = await loadNote(session.id, (await params).id);
    return { title: note?.title ?? 'Ghi chú' };
  } catch {
    // Tiêu đề tab không đáng để làm hỏng cả trang; chính `NoteDetailPage` bên
    // dưới mới là nơi lỗi cần nổi lên.
    return { title: 'Ghi chú' };
  }
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
        userId: session.id,
        shownContent: viewingOld && picked ? picked.content : note.content,
        viewingOld,
        selectedVersion: viewingOld && picked ? picked.v : latestVersion,
        latestVersion,
      }}
    />
  );
}
