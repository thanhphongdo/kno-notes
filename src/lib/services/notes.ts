// src/lib/services/notes.ts
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { getStorage } from '@/lib/storage';
import { norm, slugify } from '@/lib/text';
import {
  DEFAULT_PAGE_SIZE,
  PRIORITY_ORDER,
  type CreateNoteInput,
  type Note,
  type NoteComment,
  type NoteFilters,
  type NoteListResult,
  type NoteSummary,
  type Question,
  type Quiz,
  type SessionUser,
  type SortKey,
  type UpdateNoteInput,
} from '@/lib/types';
import { computeContentSha, removeIndex, rowToSummary, syncTags, upsertIndex } from './index-sync';

const MAX_SCAN = 5000;
const MAX_PAGE_SIZE = 100;

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Không tìm thấy ghi chú.');

/**
 * Tóm tắt kèm các đoạn đã đánh dấu. `highlights` là tuỳ chọn vì phần lớn nơi
 * gọi chỉ có metadata; thiếu và rỗng cho kết quả lọc như nhau.
 */
export type FilterableNote = NoteSummary & {
  highlights?: readonly string[];
  imageAlts?: readonly string[];
};

/**
 * Lọc — port `getList()` của prototype, mở rộng thêm ĐÚNG một điều: câu truy
 * vấn thường cũng soi các đoạn đã đánh dấu và alt của ảnh. Truy vấn `#thẻ`
 * thì KHÔNG — nó vẫn chỉ hỏi thẻ, đúng như prototype.
 *
 * Generic để giữ nguyên kiểu hàng đi vào: gọi với `NoteSummary[]` vẫn trả
 * `NoteSummary[]`.
 */
export function applyFilters<T extends FilterableNote>(rows: T[], f: NoteFilters): T[] {
  const q = norm((f.query ?? '').trim());
  return rows.filter((n) => {
    if (f.nav === 'fav' && !n.fav) return false;
    if (f.priority && n.priority !== f.priority) return false;
    if (f.tag && !n.tags.includes(f.tag)) return false;
    if (!q) return true;
    if (q[0] === '#') {
      const t = q.slice(1);
      return n.tags.some((x) => norm(x).includes(t));
    }
    return (
      norm(n.title).includes(q) ||
      norm(n.desc).includes(q) ||
      n.tags.some((x) => norm(x).includes(q)) ||
      (n.highlights ?? []).some((x) => norm(x).includes(q)) ||
      (n.imageAlts ?? []).some((x) => norm(x).includes(q))
    );
  });
}

/** Sắp xếp — port nguyên văn `cmp` của prototype. */
export function sortNotes<T extends NoteSummary>(rows: T[], sort: SortKey = 'updated'): T[] {
  const cmp: Record<SortKey, (a: NoteSummary, b: NoteSummary) => number> = {
    updated: (a, b) => b.updated.localeCompare(a.updated),
    priority: (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.updated.localeCompare(a.updated),
    title: (a, b) => a.title.localeCompare(b.title, 'vi'),
  };
  return [...rows].sort(cmp[sort] ?? cmp.updated);
}

/** Phân trang — pageSize mặc định 6, page vượt biên bị kẹp về trang cuối. */
export function paginate(rows: NoteSummary[], f: NoteFilters): NoteListResult {
  const requested = f.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = requested > 0 ? Math.min(requested, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  return {
    notes: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pages,
    pageSize,
  };
}

/**
 * Một truy vấn duy nhất: thu hẹp bằng các vị từ có index, phần còn lại
 * (query theo `norm()`, sort `localeCompare('vi')`, phân trang) làm trong JS
 * để giữ hành vi y hệt prototype. Không chạm storage adapter.
 */
export async function listNotes(
  userId: string,
  filters: NoteFilters = {},
): Promise<NoteListResult> {
  const where: SQL[] = [eq(noteIndex.userId, userId)];
  if (filters.nav === 'fav') where.push(eq(noteIndex.favorite, true));
  if (filters.priority) where.push(eq(noteIndex.priority, filters.priority));
  if (filters.tag) {
    where.push(sql`${noteIndex.tagSlugs} @> ARRAY[${slugify(filters.tag)}]::text[]`);
  }

  const rows = await db
    .select()
    .from(noteIndex)
    .where(and(...where))
    .limit(MAX_SCAN);

  // Đoạn đánh dấu và alt ảnh chỉ phục vụ việc LỌC. Chúng bị bỏ đi ngay sau đó
  // nên `NoteListResult` gửi xuống trình duyệt không hề nặng thêm.
  const summaries: FilterableNote[] = rows.map((r) => ({
    ...rowToSummary(r),
    highlights: r.highlights,
    imageAlts: r.imageAlts,
  }));
  const matched = applyFilters(summaries, filters).map(
    ({ highlights: _highlights, imageAlts: _imageAlts, ...summary }) => summary,
  );
  return paginate(sortNotes(matched, filters.sort ?? 'updated'), filters);
}

/**
 * Xác nhận note thuộc về user QUA note_index (đã scope theo user_id) rồi mới
 * đọc file. Không có hàng => 404, kể cả khi note tồn tại ở user khác.
 */
export async function getNote(userId: string, noteId: string): Promise<Note> {
  const [row] = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)))
    .limit(1);
  if (!row) throw notFound();

  const note = await getStorage().readNote(userId, noteId);
  if (!note) throw notFound();
  return note;
}

/** Id ghi chú mới — cùng dạng `n<timestamp>` như prototype, thêm hậu tố chống trùng. */
export function newNoteId(): string {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Tiêu đề rỗng => "Ghi chú không tiêu đề" (prototype). */
const titleOr = (t: string) => (t ?? '').trim() || 'Ghi chú không tiêu đề';

export async function createNote(
  userId: string,
  input: CreateNoteInput,
): Promise<{ note: Note; version: number }> {
  const now = new Date().toISOString();
  const title = titleOr(input.title);
  const note: Note = {
    id: newNoteId(),
    title,
    desc: input.desc ?? '',
    tags: input.tags ?? [],
    priority: input.priority ?? 'medium',
    fav: false,
    created: now,
    updated: now,
    content: input.content ?? '',
    images: input.images ?? [],
    comments: [],
    versions: [
      {
        v: 1,
        date: now,
        note: (input.changeNote ?? '').trim() || 'Tạo ghi chú',
        title,
        content: input.content ?? '',
      },
    ],
    quizzes: [],
    questions: input.questions ?? [],
  };

  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  await syncTags(userId, note.tags);
  return { note, version: 1 };
}

/**
 * Bump version CHỈ KHI `content` hoặc `title` đổi — port nguyên văn `save()`.
 * Đổi desc/tags/priority/images KHÔNG tạo version mới.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
): Promise<{ note: Note; version: number }> {
  const existing = await getNote(userId, noteId);
  const now = new Date().toISOString();
  const title = titleOr(input.title);
  const content = input.content ?? '';

  const last = existing.versions[existing.versions.length - 1];
  const lastV = last ? last.v : 0;
  const changed = content !== existing.content || title !== existing.title;
  const v = changed ? lastV + 1 : lastV;

  const note: Note = {
    ...existing,
    title,
    desc: input.desc ?? '',
    tags: input.tags ?? [],
    priority: input.priority ?? existing.priority,
    images: input.images ?? [],
    // `undefined` = không đụng tới. Xem chú thích ở `UpdateNoteInput`.
    questions: input.questions ?? existing.questions ?? [],
    content,
    updated: now,
    versions: changed
      ? [
          ...existing.versions,
          {
            v,
            date: now,
            note: (input.changeNote ?? '').trim() || 'Cập nhật nội dung',
            title,
            content,
          },
        ]
      : existing.versions,
  };

  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  await syncTags(userId, note.tags);
  return { note, version: v };
}

/** Ghi note + đồng bộ index trong một chỗ, để không nơi nào quên upsert. */
async function persist(userId: string, note: Note): Promise<Note> {
  await getStorage().writeNote(userId, note);
  await upsertIndex(userId, note);
  return note;
}

/**
 * Khôi phục = TẠO version mới với nội dung của version cũ, note
 * "Khôi phục từ vN" — port nguyên văn `restore()` của prototype.
 * Không cắt bớt lịch sử.
 */
export async function restoreVersion(
  userId: string,
  noteId: string,
  v: number,
): Promise<{ note: Note; version: number }> {
  const existing = await getNote(userId, noteId);
  const old = existing.versions.find((x) => x.v === v);
  if (!old) throw notFound();

  const now = new Date().toISOString();
  const last = existing.versions[existing.versions.length - 1];
  const nextV = (last ? last.v : 0) + 1;

  const note: Note = {
    ...existing,
    content: old.content,
    updated: now,
    versions: [
      ...existing.versions,
      {
        v: nextV,
        date: now,
        note: `Khôi phục từ v${old.v}`,
        title: existing.title,
        content: old.content,
      },
    ],
  };

  await persist(userId, note);
  return { note, version: nextV };
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  // getNote scopes by user_id, so this 404s for a note the caller does not own.
  await getNote(userId, noteId);
  await getStorage().deleteNote(userId, noteId);
  await removeIndex(userId, noteId);
}

export async function toggleFavorite(userId: string, noteId: string): Promise<{ fav: boolean }> {
  const existing = await getNote(userId, noteId);
  const note: Note = { ...existing, fav: !existing.fav };
  await persist(userId, note);
  return { fav: note.fav };
}

export async function addComment(
  user: SessionUser,
  noteId: string,
  text: string,
): Promise<{ comment: NoteComment; note: Note }> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new HttpError(400, 'INVALID_INPUT', 'Bình luận không được để trống.');
  const existing = await getNote(user.id, noteId);

  const comment: NoteComment = {
    id: newId('c'),
    text: trimmed,
    date: new Date().toISOString(),
    author: { id: user.id, displayName: user.displayName },
  };
  const note: Note = { ...existing, comments: [...existing.comments, comment] };
  await persist(user.id, note);
  return { comment, note };
}

export async function deleteComment(
  userId: string,
  noteId: string,
  commentId: string,
): Promise<{ note: Note }> {
  const existing = await getNote(userId, noteId);
  if (!existing.comments.some((c) => c.id === commentId)) throw notFound();

  const note: Note = { ...existing, comments: existing.comments.filter((c) => c.id !== commentId) };
  await persist(userId, note);
  return { note };
}

/**
 * Highlight — port nguyên văn `hlCommit()`: ghi vào `content` VÀ content của
 * version CUỐI, KHÔNG tạo version mới.
 */
export async function saveHighlights(
  userId: string,
  noteId: string,
  content: string,
): Promise<{ ok: true; contentSha: string; note: Note }> {
  const existing = await getNote(userId, noteId);
  const lastIdx = existing.versions.length - 1;

  const note: Note = {
    ...existing,
    content,
    versions: existing.versions.map((v, i) => (i === lastIdx ? { ...v, content } : v)),
  };
  await persist(userId, note);
  // computeContentSha strips <mark>, so this is unchanged by highlighting —
  // the client's cached embedding stays valid. It is returned anyway so the
  // client can confirm that.
  return { ok: true, contentSha: computeContentSha(note), note };
}

/**
 * Thay bộ câu hỏi soạn sẵn. KHÔNG tạo phiên bản mới: câu hỏi là thứ gắn kèm
 * ghi chú, không phải nội dung bài — cùng lý do như đánh dấu đoạn.
 */
export async function setQuestions(
  userId: string,
  noteId: string,
  questions: Question[],
): Promise<{ note: Note; count: number }> {
  const existing = await getNote(userId, noteId);
  const note: Note = { ...existing, questions };
  await persist(userId, note);
  return { note, count: questions.length };
}

/** Lịch sử quiz — mới nhất ở ĐẦU mảng, đúng như prototype. */
export async function addQuizRecord(
  userId: string,
  noteId: string,
  rec: Omit<Quiz, 'id' | 'date'> & { id?: string; date?: string },
): Promise<{ quiz: Quiz; note: Note }> {
  const existing = await getNote(userId, noteId);

  if (
    !Array.isArray(rec.questions) ||
    !Array.isArray(rec.picks) ||
    rec.picks.length !== rec.questions.length
  ) {
    throw new HttpError(400, 'INVALID_INPUT', 'Số câu trả lời không khớp số câu hỏi.');
  }

  const quiz: Quiz = {
    id: rec.id ?? newId('q'),
    date: rec.date ?? new Date().toISOString(),
    score: rec.score,
    total: rec.total,
    source: rec.source,
    picks: rec.picks,
    questions: rec.questions,
  };

  const note: Note = { ...existing, quizzes: [quiz, ...existing.quizzes] };
  await persist(userId, note);
  return { quiz, note };
}
