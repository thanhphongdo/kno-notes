// src/lib/services/index-sync.ts
import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, noteIndex, tags, type NoteIndexDbRow } from '@/lib/db';
import { norm, slugify, stripHtml } from '@/lib/text';
import type { Note, NoteSummary, Priority } from '@/lib/types';

export function rowToSummary(row: NoteIndexDbRow): NoteSummary {
  return {
    id: row.noteId,
    title: row.title,
    desc: row.description,
    tags: row.tagNames,
    priority: row.priority as Priority,
    fav: row.favorite,
    created: row.createdAt.toISOString(),
    updated: row.updatedAt.toISOString(),
    latestVersion: row.latestVersion,
    imageCount: row.imageCount,
    commentCount: row.commentCount,
    quizCount: row.quizCount,
  };
}

/**
 * Băm ngữ nghĩa cho `note_index.content_sha` (part-0 §3.2).
 * Nguồn băm = `title \n desc \n tags.join(',') \n plain`, trong đó `plain` đã
 * bỏ thẻ `<mark>`. Nhờ vậy: đổi tiêu đề/mô tả/thẻ => embedding phía trình duyệt
 * bị vô hiệu; thêm/bỏ highlight => KHÔNG vô hiệu.
 * KHÁC với blob sha của storage adapter (chỉ dùng nội bộ adapter).
 */
export function computeContentSha(note: Note): string {
  const plain = stripHtml((note.content || '').replace(/<\/?mark[^>]*>/g, ''));
  const source = [note.title, note.desc, note.tags.join(','), plain].join('\n');
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/** Mọi giá trị dẫn xuất của note_index được tính ở đúng một chỗ: tại đây. */
export function derivedIndexValues(note: Note) {
  return {
    title: note.title,
    titleNorm: norm(note.title),
    description: note.desc,
    descriptionNorm: norm(note.desc),
    priority: note.priority,
    favorite: note.fav,
    tagSlugs: note.tags.map(slugify),
    tagNames: note.tags,
    createdAt: new Date(note.created),
    updatedAt: new Date(note.updated),
    latestVersion: note.versions.length ? note.versions[note.versions.length - 1].v : 1,
    imageCount: note.images.length,
    commentCount: note.comments.length,
    quizCount: note.quizzes.length,
    contentSha: computeContentSha(note),
  };
}

/** Một round-trip: INSERT … ON CONFLICT (user_id, note_id) DO UPDATE. */
export async function upsertIndex(userId: string, note: Note): Promise<void> {
  const values = derivedIndexValues(note);
  await db
    .insert(noteIndex)
    .values({ userId, noteId: note.id, ...values })
    .onConflictDoUpdate({
      target: [noteIndex.userId, noteIndex.noteId],
      set: values,
    });
}

export async function removeIndex(userId: string, noteId: string): Promise<void> {
  await db.delete(noteIndex).where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)));
}

/** Thêm các tag mới của user vào bảng `tags`. Bỏ qua tag đã có (UNIQUE user+slug). */
export async function syncTags(userId: string, tagNames: string[]): Promise<void> {
  const wanted = new Map<string, string>();
  for (const name of tagNames) {
    const slug = slugify(name);
    if (!wanted.has(slug)) wanted.set(slug, name);
  }
  if (!wanted.size) return;

  const existing = await db
    .select({ slug: tags.slug })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.slug, [...wanted.keys()])));
  const have = new Set(existing.map((r) => r.slug));

  const toInsert = [...wanted.entries()]
    .filter(([slug]) => !have.has(slug))
    .map(([slug, name]) => ({ userId, name, slug }));
  if (toInsert.length) {
    await db.insert(tags).values(toInsert).onConflictDoNothing();
  }
}
