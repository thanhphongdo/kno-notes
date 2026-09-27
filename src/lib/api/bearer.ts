// src/lib/api/bearer.ts
import { findUserById, hashApiKey, resolveApiKey } from '@/lib/auth/api-keys';
import { verifyToken } from '@/lib/auth/oauth';

import { HttpError } from '@/lib/http';
import type { SessionUser } from '@/lib/types';
import { takeToken } from './rate-limit';

/**
 * Xác thực `Authorization: Bearer …` + áp rate limit theo khoá.
 *
 * Nhận HAI loại bearer:
 *  • API key tĩnh `kn_…` — dán tay vào cấu hình, dùng cho Claude Code.
 *  • Access token OAuth — client như claude.ai tự lấy qua luồng đăng nhập.
 *
 * Phân biệt bằng tiền tố chứ không thử lần lượt: một chuỗi rác không nên tốn
 * cả một lượt truy vấn cơ sở dữ liệu lẫn một lượt kiểm chữ ký.
 */
export async function requireBearer(req: Request): Promise<SessionUser> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Thiếu header Authorization: Bearer <api key>.');
  }
  const key = match[1];

  // Rate-limit by the key's hash so a wrong key cannot be used to probe
  // another key's remaining budget, and the raw key never enters a Map key.
  const bucket = hashApiKey(key);
  const limit = takeToken(bucket);
  if (!limit.ok) {
    throw new HttpError(429, 'RATE_LIMITED', `Quá nhiều yêu cầu. Thử lại sau ${limit.resetSec} giây.`);
  }

  if (key.startsWith('kn_')) {
    const user = await resolveApiKey(key);
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'API key không hợp lệ.');
    return user;
  }

  const claims = await verifyToken(key, 'at');
  if (!claims) throw new HttpError(401, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn.');

  // Token tự chứa, nên vẫn phải hỏi lại xem tài khoản còn tồn tại: xoá user
  // mà token cũ vẫn dùng được thì việc xoá chẳng có nghĩa gì.
  const user = await findUserById(claims.userId);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại.');
  return user;
}
