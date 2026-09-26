// src/lib/auth/jwt.ts
// EDGE-SAFE. `src/middleware.ts` imports this file, so it must never pull in
// the database, bcryptjs, @octokit/rest or next/headers.
import { SignJWT, jwtVerify } from 'jose';
import type { SessionUser } from '@/lib/types';

export const SESSION_COOKIE = 'kn_session';
/** 30 ngày, tính bằng giây. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const ALG = 'HS256';

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, displayName: user.displayName })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

/** Trả về null với MỌI lỗi (sai chữ ký, hết hạn, rác) — không ném. */
export async function verifySession(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    const id = payload.sub;
    const username = payload.username;
    const displayName = payload.displayName;
    if (typeof id !== 'string' || typeof username !== 'string' || typeof displayName !== 'string') {
      return null;
    }
    return { id, username, displayName };
  } catch {
    return null;
  }
}
