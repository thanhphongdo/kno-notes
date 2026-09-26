import type { NoteImage } from '@/lib/types';

export interface UploadResult {
  images: NoteImage[];
  /** How many picked files were rejected by the server. */
  failed: number;
}

/**
 * `POST /api/images` takes exactly one `file` per request, so a multi-file pick
 * becomes one request per image. Non-image files are dropped before any request
 * is made, exactly as the prototype's `readFiles` does.
 */
export async function uploadImages(files: Iterable<File>): Promise<UploadResult> {
  const picked = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const images: NoteImage[] = [];
  let failed = 0;

  for (const file of picked) {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/images', { method: 'POST', body });
    if (!res.ok) {
      failed += 1;
      continue;
    }
    const { image } = (await res.json()) as { image: NoteImage };
    images.push(image);
  }

  return { images, failed };
}
