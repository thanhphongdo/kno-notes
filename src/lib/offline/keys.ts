// src/lib/offline/keys.ts
//
// Khoá của kho offline.
//
// Cả kho dùng MỘT object store, phân loại bằng tiền tố trong khoá. Đổi lại
// việc không có index, ta được một thứ quan trọng hơn: mọi khoá đều bắt đầu
// bằng `<loại>:<userId>:`, nên không có đường nào đọc dữ liệu của user khác mà
// không cố ý — IndexedDB dùng chung cho cả origin, máy này có thể có nhiều
// người đăng nhập lần lượt.

export const NOTE_PREFIX = 'n';
export const IMAGE_PREFIX = 'i';
export const QUEUE_PREFIX = 'q';
export const META_PREFIX = 'm';

/** Đủ rộng cho mốc thời gian mili giây tới năm 5138. */
const SEQ_WIDTH = 16;

export const scopePrefix = (kind: string, userId: string): string => `${kind}:${userId}:`;

export const noteKey = (userId: string, noteId: string): string =>
  `${scopePrefix(NOTE_PREFIX, userId)}${noteId}`;

export const imageKey = (userId: string, imageId: string): string =>
  `${scopePrefix(IMAGE_PREFIX, userId)}${imageId}`;

export const metaKey = (userId: string, name: string): string =>
  `${scopePrefix(META_PREFIX, userId)}${name}`;

/**
 * Khoá hàng đợi sắp xếp được theo thứ tự tạo: kho trả khoá theo thứ tự chữ
 * cái, nên số thứ tự phải đệm 0 cho đủ độ rộng, nếu không "10" sẽ đứng trước
 * "9" và các thao tác ngoại tuyến bị phát lại sai thứ tự.
 */
export const queueKey = (userId: string, seq: number): string =>
  `${scopePrefix(QUEUE_PREFIX, userId)}${String(seq).padStart(SEQ_WIDTH, '0')}`;

/** Phần đuôi sau `<loại>:<userId>:`, hoặc null nếu khoá không thuộc phạm vi đó. */
export function idFromKey(kind: string, userId: string, key: string): string | null {
  const prefix = scopePrefix(kind, userId);
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/**
 * Id ảnh lấy từ `src` của nó (`/api/images/<userId>/<imageId>`).
 * Trả null cho đường dẫn lạ — ảnh dán từ nơi khác thì không tải trước được.
 */
export function imageIdFromSrc(src: string): string | null {
  const match = /^\/api\/images\/[^/]+\/([^/?#]+)/.exec(src);
  return match ? decodeURIComponent(match[1]) : null;
}
