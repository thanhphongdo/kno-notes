// src/lib/http/index.ts
import { ZodError } from 'zod';
import { StorageConflictError } from '@/lib/storage/types';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Vỏ lỗi JSON dùng chung cho cả API nội bộ và `/api/v1`. */
export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Bọc một route handler. Trả Response nguyên vẹn nếu handler trả Response,
 * ngược lại JSON 200. Mọi lỗi đều thành vỏ lỗi chuẩn.
 */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.code, e.message);
    if (e instanceof ZodError) {
      return jsonError(
        400,
        'INVALID_INPUT',
        e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    if (e instanceof StorageConflictError) {
      return jsonError(409, 'CONFLICT', 'Ghi chú vừa được sửa ở nơi khác. Vui lòng thử lại.');
    }
    // Never echo the raw message: it can carry connection strings and tokens.
    console.error('[api]', e);
    return jsonError(500, 'INTERNAL', 'Đã có lỗi xảy ra. Vui lòng thử lại.');
  }
}
