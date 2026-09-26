// src/lib/services/search-index.ts
import { eq } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { stripHtml } from '@/lib/text/server';
import type { Note } from '@/lib/types';
import { computeContentSha } from './index-sync';

/**
 * Trình duyệt chỉ nhúng khoảng 512 token đầu (e5-small), nên gửi nhiều hơn
 * chỉ tốn băng thông trên điện thoại.
 */
export const PLAIN_MAX = 2000;

const MAX_NOTES = 5000;

/** part-0-contracts §3.1 — sáu trường, không hơn không kém. */
export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
  /** sha256 của `title \n desc \n tags.join(',') \n plain` — xem computeContentSha. */
  contentSha: string;
  /** stripHtml(content) đã bỏ `<mark>`, cắt còn PLAIN_MAX ký tự. */
  plain: string;
}

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
  const rows = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(eq(noteIndex.userId, userId))
    .limit(MAX_NOTES);

  const storage = getStorage();
  const loaded = await Promise.all(rows.map((r) => storage.readNote(userId, r.noteId)));

  return loaded
    .filter((n): n is Note => n !== null)
    .map((n) => ({
      noteId: n.id,
      title: n.title,
      desc: n.desc,
      tags: n.tags,
      contentSha: computeContentSha(n),
      plain: plainFor(n),
    }));
}
