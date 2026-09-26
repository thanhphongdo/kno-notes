// src/lib/services/images.ts
import { HttpError } from '@/lib/http';
import { getStorage, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/storage';
import type { NoteImage } from '@/lib/types';
import { newId } from './notes';

export const imageUrl = (userId: string, imageId: string): string =>
  `/api/images/${userId}/${imageId}`;

/**
 * Nhận dạng định dạng qua magic bytes. Không dùng thư viện xử lý ảnh
 * (`sharp` cần binary native, tốn bundle size trên Vercel): ta không resize
 * hay re-encode, chỉ cần chắc chắn file đúng là ảnh.
 */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buf.subarray(4, 8).toString('latin1') === 'ftyp' &&
    buf.subarray(8, 12).toString('latin1').startsWith('avif')
  ) {
    return 'image/avif';
  }
  return null;
}

/** Tải ảnh lên storage của CHÍNH user. Không nhận đường dẫn từ caller. */
export async function uploadImage(userId: string, file: File): Promise<NoteImage> {
  const declared = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(declared)) {
    throw new HttpError(
      400,
      'INVALID_IMAGE',
      `Chỉ chấp nhận ảnh ${ALLOWED_IMAGE_TYPES.map((t) => t.replace('image/', '')).join(', ')}.`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt quá 4MB.');
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) throw new HttpError(400, 'INVALID_IMAGE', 'Tệp rỗng.');
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt quá 4MB.');
  }

  // A renamed .exe with a PNG content-type must not get through.
  const sniffed = sniffImageType(buf);
  if (!sniffed || sniffed !== declared) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Nội dung tệp không phải ảnh hợp lệ.');
  }

  const id = newId('img');
  await getStorage().putImage(userId, id, buf, sniffed);

  return { id, label: file.name || 'Hình ảnh', src: imageUrl(userId, id) };
}
