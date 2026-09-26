// src/lib/auth/session.ts
// Node runtime only — uses next/headers. Never import from middleware.ts.
import { cookies } from 'next/headers';
import { HttpError } from '@/lib/http';
import type { SessionUser } from '@/lib/types';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from './jwt';

/** Server helper: phiên hiện tại hoặc null. Dùng được ở Server Component và route. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Dùng trong route handler: ném 401 nếu chưa đăng nhập. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
  return user;
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
