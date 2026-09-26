// src/lib/offline/sync.ts
//
// Hai chiều đồng bộ:
//   • `prefetchNotes` — kéo toàn bộ nội dung về máy lúc rảnh, để đọc khi mất
//     mạng. So bằng `latestVersion` nên lần chạy thứ hai gần như không tốn gì.
//   • `replayQueue` — đẩy các thao tác đã làm lúc ngoại tuyến lên máy chủ.
//
// `fetch` được tiêm vào để test chạy được mà không cần mạng, và để nơi gọi
// quyết định dùng fetch nào (trang, hay worker).

import type { Note, NoteListResult, NoteSummary } from '@/lib/types';
import { imageIdFromSrc } from './keys';
import {
  cachedImageIds, cachedVersions, listCachedNotes, pruneImages, pruneNotes,
  putImage, putNote, staleNotes,
} from './cache';
import {
  isNetworkFailure, isRetryableStatus, pendingWrites, removeWrite, type QueuedWrite,
} from './queue';

export type Fetcher = typeof fetch;

/** Trang lớn nhất máy chủ cho phép (`MAX_PAGE_SIZE`). */
const LIST_PAGE_SIZE = 100;

/** Chặn trên số ghi chú tải về, để một tài khoản lớn không nuốt hết dung lượng. */
export const MAX_OFFLINE_NOTES = 500;

/** Ảnh lớn hơn mức này thì bỏ qua — vẫn đọc được chữ, chỉ thiếu hình. */
export const MAX_OFFLINE_IMAGE_BYTES = 4 * 1024 * 1024;

export interface PrefetchResult {
  /** Số ghi chú vừa tải hoặc vừa cập nhật. */
  notes: number;
  images: number;
  /** Tổng số ghi chú user có — dùng để hiện "12/14". */
  total: number;
  /** Dừng giữa chừng vì mất mạng: lần sau chạy tiếp từ chỗ còn thiếu. */
  interrupted: boolean;
}

async function json<T>(fetcher: Fetcher, url: string): Promise<T> {
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** Danh sách tóm tắt của mọi ghi chú, lần lượt từng trang. */
export async function fetchAllSummaries(fetcher: Fetcher): Promise<NoteSummary[]> {
  const out: NoteSummary[] = [];
  for (let page = 1; ; page += 1) {
    const result = await json<NoteListResult>(
      fetcher,
      `/api/notes?page=${page}&pageSize=${LIST_PAGE_SIZE}`,
    );
    out.push(...result.notes);
    if (page >= result.pages || out.length >= MAX_OFFLINE_NOTES) break;
  }
  return out.slice(0, MAX_OFFLINE_NOTES);
}

/**
 * Tải nội dung đầy đủ của những ghi chú còn thiếu hoặc đã cũ, kèm ảnh của
 * chúng. Mất mạng giữa chừng thì dừng lại và báo `interrupted` — những gì đã
 * tải vẫn nằm trong kho, lần sau chỉ tải phần còn lại.
 */
export async function prefetchNotes(
  userId: string,
  fetcher: Fetcher = fetch,
  onProgress?: (done: number, total: number) => void,
): Promise<PrefetchResult> {
  const summaries = await fetchAllSummaries(fetcher);
  await pruneNotes(userId, summaries.map((s) => s.id));

  const stale = staleNotes(summaries, await cachedVersions(userId));
  const result: PrefetchResult = { notes: 0, images: 0, total: summaries.length, interrupted: false };

  const haveImages = await cachedImageIds(userId);
  const wantImages = new Set<string>();

  // Ghi chú đã có sẵn trong kho vẫn phải khai báo ảnh của chúng, nếu không
  // bước dọn dẹp cuối hàm sẽ xoá mất ảnh của những bài không tải lại lần này.
  for (const row of await listCachedNotes(userId)) {
    for (const image of row.note.images) {
      const id = imageIdFromSrc(image.src);
      if (id) wantImages.add(id);
    }
  }

  for (const summary of stale) {
    try {
      const { note } = await json<{ note: Note }>(fetcher, `/api/notes/${encodeURIComponent(summary.id)}`);
      await putNote(userId, note);
      result.notes += 1;
      for (const image of note.images) {
        const id = imageIdFromSrc(image.src);
        if (id) wantImages.add(id);
      }
    } catch (error) {
      if (isNetworkFailure(error)) {
        result.interrupted = true;
        break;
      }
      // 404: ghi chú vừa bị xoá ở máy khác. Bỏ qua, danh sách lần sau sẽ đúng.
    }
    onProgress?.(result.notes, stale.length);
  }

  if (!result.interrupted) {
    for (const id of wantImages) {
      if (haveImages.has(id)) continue;
      try {
        const res = await fetcher(`/api/images/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`);
        if (!res.ok) continue;
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > MAX_OFFLINE_IMAGE_BYTES) continue;
        await putImage(userId, id, bytes, res.headers.get('Content-Type') ?? 'image/png');
        result.images += 1;
      } catch (error) {
        if (isNetworkFailure(error)) {
          result.interrupted = true;
          break;
        }
      }
    }
    await pruneImages(userId, wantImages);
  }

  return result;
}

export interface ReplayResult {
  /** Số thao tác đã gửi thành công. */
  sent: number;
  /** Số thao tác máy chủ từ chối hẳn — đã bỏ khỏi hàng đợi. */
  rejected: number;
  /** Còn lại trong hàng đợi (mất mạng lại, hoặc máy chủ đang lỗi). */
  remaining: number;
}

/**
 * Gửi lần lượt những gì đang chờ, dừng ngay khi gặp lỗi có thể thử lại.
 *
 * Dừng chứ không bỏ qua: thứ tự là một phần ý nghĩa của các thao tác. Một mục
 * bị máy chủ từ chối hẳn (4xx không thử lại được) thì bỏ đi — giữ lại chỉ làm
 * kẹt vĩnh viễn mọi mục phía sau.
 */
export async function replayQueue(userId: string, fetcher: Fetcher = fetch): Promise<ReplayResult> {
  const queue = await pendingWrites(userId);
  const result: ReplayResult = { sent: 0, rejected: 0, remaining: queue.length };

  for (const write of queue) {
    let res: Response;
    try {
      res = await fetcher(write.path, {
        method: write.method,
        headers: { 'Content-Type': 'application/json' },
        body: write.body == null ? undefined : JSON.stringify(write.body),
      });
    } catch (error) {
      if (isNetworkFailure(error)) break;
      throw error;
    }

    if (res.ok) {
      await removeWrite(write.key);
      result.sent += 1;
      result.remaining -= 1;
      continue;
    }
    if (isRetryableStatus(res.status)) break;

    await removeWrite(write.key);
    result.rejected += 1;
    result.remaining -= 1;
  }

  return result;
}

export type { QueuedWrite };
