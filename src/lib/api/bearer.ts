// src/lib/api/bearer.ts
import { hashApiKey, resolveApiKey } from '@/lib/auth/api-keys';
import { HttpError } from '@/lib/http';
import type { SessionUser } from '@/lib/types';
import { takeToken } from './rate-limit';

/** Xác thực `Authorization: Bearer kn_…` + áp rate limit theo khoá. */
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

  const user = await resolveApiKey(key);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'API key không hợp lệ.');
  return user;
}
