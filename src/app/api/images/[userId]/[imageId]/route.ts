import { getSession } from '@/lib/auth/session';
import { jsonError } from '@/lib/http';
import { getStorage, type StoredImage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string; imageId: string }> },
) {
  const { userId, imageId } = await ctx.params;

  const session = await getSession();
  if (!session) return jsonError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');

  // Ownership, not authorisation: 404 so the response cannot confirm existence.
  if (session.id !== userId) return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');

  let image: StoredImage | null;
  try {
    // Always read under the SESSION user id, never the path parameter.
    image = await getStorage().getImage(session.id, imageId);
  } catch {
    // safeSegment rejected the id.
    return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
  }
  if (!image) return jsonError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');

  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.length),
      // Image ids are unique per upload and never reused, so this is safe.
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${image.sha}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
