// src/lib/services/search-index.ts
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { stripHtml } from '@/lib/text/server';
import type { Note, Priority, SearchDoc } from '@/lib/types';
import { computeContentSha } from './index-sync';

export type { SearchDoc };

/**
 * Trình duyệt chỉ nhúng khoảng 512 token đầu (e5-small), nên gửi nhiều hơn
 * chỉ tốn băng thông trên điện thoại.
 */
export const PLAIN_MAX = 2000;

const MAX_NOTES = 5000;

/**
 * Bỏ thẻ `<mark>` GIỐNG HỆT `computeContentSha`, rồi strip HTML và cắt.
 * Nếu lệch, sha sẽ báo "không đổi" trong khi văn bản client nhúng đã khác.
 */
export function plainFor(note: Note): string {
  return stripHtml((note.content || '').replace(/<\/?mark[^>]*>/g, '')).slice(0, PLAIN_MAX);
}

/**
 * Nạp toàn bộ tài liệu tìm kiếm của MỘT user. Đọc song song từ storage
 * (adapter đã cache theo sha nên lần gọi lại gần như miễn phí).
 * Hàng index còn sót nhưng file đã mất thì bị bỏ qua, không ném.
 */
export async function buildSearchDocs(userId: string): Promise<SearchDoc[]> {
  // `priority` và `updated_at` đã nằm sẵn trong note_index — lấy luôn ở đây,
  // không tốn thêm truy vấn, và UI gợi ý mới vẽ đúng chấm ưu tiên.
  const rows = await db
    .select({
      noteId: noteIndex.noteId,
      priority: noteIndex.priority,
      updatedAt: noteIndex.updatedAt,
    })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(MAX_NOTES);

  const storage = getStorage();
  const loaded = await Promise.all(rows.map((r) => storage.readNote(userId, r.noteId)));

  return rows
    .map((row, i) => ({ row, note: loaded[i] }))
    .filter((pair): pair is { row: (typeof rows)[number]; note: Note } => pair.note != null)
    .map(({ row, note: n }) => ({
      noteId: n.id,
      title: n.title,
      desc: n.desc,
      tags: n.tags,
      priority: row.priority as Priority,
      updated: row.updatedAt.toISOString(),
      contentSha: computeContentSha(n),
      plain: plainFor(n),
    }));
}
