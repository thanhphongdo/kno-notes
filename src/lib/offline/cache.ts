// src/lib/offline/cache.ts
//
// Bản sao ghi chú để đọc khi mất mạng.
//
// So khớp bằng `latestVersion`: danh sách ở `/api/notes` đã mang sẵn số phiên
// bản của từng ghi chú, nên biết bản nào cũ chỉ tốn đúng một request, không
// phải tải lại cả bài. Khi trực tuyến luôn lấy bản mới nhất và ghi đè, để lúc
// chuyển sang ngoại tuyến thứ đọc được đúng là thứ vừa thấy.

import type { Note, NoteSummary } from '@/lib/types';
import { IMAGE_PREFIX, NOTE_PREFIX, idFromKey, imageKey, noteKey, scopePrefix } from './keys';
import { deleteRows, getRow, getRows, keysWithPrefix, putRows, type StoredRow } from './store';

export interface CachedNote extends StoredRow {
  key: string;
  userId: string;
  noteId: string;
  /** `note.versions` cuối cùng — thứ đem so với `latestVersion` của danh sách. */
  version: number;
  note: Note;
  savedAt: number;
}

export interface CachedImage extends StoredRow {
  key: string;
  userId: string;
  imageId: string;
  type: string;
  bytes: ArrayBuffer;
  savedAt: number;
}

/** Số phiên bản hiện hành của một ghi chú đầy đủ. */
export const versionOf = (note: Note): number =>
  note.versions.length ? note.versions[note.versions.length - 1].v : 1;

export async function putNote(userId: string, note: Note): Promise<void> {
  const row: CachedNote = {
    key: noteKey(userId, note.id),
    userId,
    noteId: note.id,
    version: versionOf(note),
    note,
    savedAt: Date.now(),
  };
  await putRows([row]);
}

export async function getCachedNote(userId: string, noteId: string): Promise<Note | null> {
  const row = await getRow<CachedNote>(noteKey(userId, noteId));
  return row?.userId === userId ? row.note : null;
}

/** Mọi ghi chú đã tải về của một user, mới cập nhật trước. */
export async function listCachedNotes(userId: string): Promise<CachedNote[]> {
  const keys = await keysWithPrefix(scopePrefix(NOTE_PREFIX, userId));
  const rows = await getRows<CachedNote>(keys);
  return rows
    .filter((row) => row.userId === userId && row.note)
    .sort((a, b) => b.note.updated.localeCompare(a.note.updated));
}

/** `noteId -> version` của những gì đang có trong kho. */
export async function cachedVersions(userId: string): Promise<Map<string, number>> {
  const rows = await listCachedNotes(userId);
  return new Map(rows.map((row) => [row.noteId, row.version]));
}

/**
 * Ghi chú cần tải: chưa có, hoặc bản trong kho cũ hơn bản trên máy chủ.
 * Bản trong kho MỚI hơn (vừa sửa ngoại tuyến, chưa đồng bộ) thì không đụng.
 */
export function staleNotes(
  summaries: readonly NoteSummary[],
  cached: ReadonlyMap<string, number>,
): NoteSummary[] {
  return summaries.filter((s) => {
    const have = cached.get(s.id);
    return have == null || have < s.latestVersion;
  });
}

/** Bỏ khỏi kho những ghi chú user không còn nữa. */
export async function pruneNotes(userId: string, keepNoteIds: readonly string[]): Promise<void> {
  const keep = new Set(keepNoteIds);
  const keys = await keysWithPrefix(scopePrefix(NOTE_PREFIX, userId));
  const doomed = keys.filter((key) => {
    const id = idFromKey(NOTE_PREFIX, userId, key);
    return id != null && !keep.has(id);
  });
  await deleteRows(doomed);
}

// ── ảnh ─────────────────────────────────────────────────────────────────────

export async function putImage(
  userId: string,
  imageId: string,
  bytes: ArrayBuffer,
  type: string,
): Promise<void> {
  const row: CachedImage = {
    key: imageKey(userId, imageId),
    userId,
    imageId,
    type,
    bytes,
    savedAt: Date.now(),
  };
  await putRows([row]);
}

export async function getCachedImage(userId: string, imageId: string): Promise<CachedImage | null> {
  const row = await getRow<CachedImage>(imageKey(userId, imageId));
  return row?.userId === userId ? row : null;
}

export async function cachedImageIds(userId: string): Promise<Set<string>> {
  const keys = await keysWithPrefix(scopePrefix(IMAGE_PREFIX, userId));
  const ids = keys
    .map((key) => idFromKey(IMAGE_PREFIX, userId, key))
    .filter((id): id is string => id != null);
  return new Set(ids);
}

export async function pruneImages(userId: string, keepImageIds: ReadonlySet<string>): Promise<void> {
  const keys = await keysWithPrefix(scopePrefix(IMAGE_PREFIX, userId));
  const doomed = keys.filter((key) => {
    const id = idFromKey(IMAGE_PREFIX, userId, key);
    return id != null && !keepImageIds.has(id);
  });
  await deleteRows(doomed);
}
