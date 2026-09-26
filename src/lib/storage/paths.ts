// src/lib/storage/paths.ts

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Kiểm tra một đoạn đường dẫn. Bất kỳ giá trị nào không phải định danh đơn giản
 * đều bị từ chối TRƯỚC khi có bất kỳ I/O nào, nên không adapter nào có thể bị
 * dụ ra khỏi tiền tố `data/users/<userId>/`.
 *
 * Danh sách cho phép, không phải danh sách cấm: chỉ `[A-Za-z0-9._-]` sống sót
 * và ký tự đầu phải là chữ/số, nên `.` và `..` không thể xuất hiện dù mã hoá
 * kiểu gì.
 */
export function safeSegment(value: string, label: string): string {
  if (typeof value !== 'string' || !SEGMENT_RE.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

export const userRoot = (userId: string): string => `data/users/${safeSegment(userId, 'userId')}`;

export const notesDir = (userId: string): string => `${userRoot(userId)}/notes`;

export const notePath = (userId: string, noteId: string): string =>
  `${notesDir(userId)}/${safeSegment(noteId, 'noteId')}.json`;

export const imagesDir = (userId: string): string => `${userRoot(userId)}/images`;

export const imagePath = (userId: string, imageId: string, ext: string): string =>
  `${imagesDir(userId)}/${safeSegment(imageId, 'imageId')}.${safeSegment(ext, 'ext')}`;

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** SVG is deliberately absent: it can carry script and these bytes are served inline. */
export function extForContentType(contentType: string): string {
  const key = (contentType || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_EXT[key];
  if (!ext) throw new Error(`Unsupported image content type: ${contentType}`);
  return ext;
}

export const CONTENT_TYPE_FOR_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export const ALLOWED_IMAGE_TYPES: string[] = Object.keys(IMAGE_EXT);
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
