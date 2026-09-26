// src/lib/offline/queue.ts
//
// Hàng đợi các thay đổi chưa gửi được lên máy chủ.
//
// Một thao tác vào đây khi và chỉ khi nó thất bại vì MẠNG. Máy chủ trả 4xx là
// câu trả lời thật ("ghi chú không còn", "dữ liệu sai") — phát lại chỉ hỏng
// thêm. Phân biệt hai thứ đó là việc của `isNetworkFailure`.
//
// Thứ tự là FIFO tuyệt đối: đổi tiêu đề rồi thêm bình luận mà phát lại ngược
// thì bình luận rơi vào một bản ghi chú chưa tồn tại. Khoá hàng đợi vì thế
// sắp xếp được (xem `queueKey`), và `replay` dừng ngay tại mục đầu tiên hỏng
// thay vì nhảy cóc.

import { QUEUE_PREFIX, queueKey, scopePrefix } from './keys';
import { deleteRows, getRows, keysWithPrefix, putRows, type StoredRow } from './store';

export type QueuedKind =
  | 'note.create'
  | 'note.update'
  | 'note.favorite'
  | 'note.highlights'
  | 'comment.add';

/**
 * Khai báo tách khỏi `QueuedWrite` là có lý do: `StoredRow` mang index
 * signature `[field: string]: unknown`, nên `Omit<QueuedWrite, …>` sẽ nuốt
 * mất mọi trường cụ thể và trả về `{ [x: string]: unknown }`.
 */
export interface QueuedWriteFields {
  kind: QueuedKind;
  /** Đường dẫn API, đã gồm noteId nếu có. */
  path: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: unknown;
  /** Mô tả ngắn để hiện cho người dùng: "Lưu ghi chú Phác đồ…". */
  label: string;
  /** Ghi chú liên quan, để màn hình ngoại tuyến biết mục nào đang chờ. */
  noteId: string | null;
}

export interface QueuedWrite extends StoredRow, QueuedWriteFields {
  key: string;
  userId: string;
  createdAt: number;
}

export type NewQueuedWrite = QueuedWriteFields;

/**
 * Hai mục tạo trong cùng một mili giây vẫn phải khác khoá, nếu không mục sau
 * ghi đè mục trước và một thao tác biến mất không dấu vết.
 */
let tick = 0;
const nextSeq = (now: number): number => {
  tick = (tick + 1) % 1000;
  return now * 1000 + tick;
};

export async function enqueue(userId: string, write: NewQueuedWrite): Promise<QueuedWrite> {
  const now = Date.now();
  const row: QueuedWrite = {
    key: queueKey(userId, nextSeq(now)),
    userId,
    createdAt: now,
    kind: write.kind,
    path: write.path,
    method: write.method,
    body: write.body,
    label: write.label,
    noteId: write.noteId,
  };
  await putRows([row]);
  return row;
}

/** Mọi thao tác đang chờ, theo đúng thứ tự người dùng đã làm. */
export async function pendingWrites(userId: string): Promise<QueuedWrite[]> {
  const keys = await keysWithPrefix(scopePrefix(QUEUE_PREFIX, userId));
  const rows = await getRows<QueuedWrite>(keys);
  return rows.filter((row) => row.userId === userId);
}

export async function removeWrite(key: string): Promise<void> {
  await deleteRows([key]);
}

export async function clearQueue(userId: string): Promise<void> {
  await deleteRows(await keysWithPrefix(scopePrefix(QUEUE_PREFIX, userId)));
}

/**
 * `fetch` chỉ ném khi không gửi được — mất mạng, DNS hỏng, kết nối đứt.
 * Máy chủ trả về bất cứ mã nào cũng là đã tới nơi.
 *
 * 5xx được tính là "thử lại được" vì đó là máy chủ đang hỏng tạm thời, không
 * phải yêu cầu sai. 408 và 429 cũng vậy.
 */
export const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === 'TypeError');
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.includes(status);
}
