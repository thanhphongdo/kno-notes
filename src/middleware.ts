// src/middleware.ts
// EDGE RUNTIME. Imports `jose` only — never the db, bcryptjs, @octokit/rest
// or next/headers, all of which break the Edge build.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/jwt';

/** Trang cần đăng nhập. API tự kiểm tra bằng `requireUser()`. */
const PROTECTED = [/^\/$/, /^\/notes(\/|$)/, /^\/settings(\/|$)/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  const user = await verifySession(token);

  if (pathname === '/login') {
    if (user) {
      const to = req.nextUrl.clone();
      to.pathname = '/';
      to.search = '';
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }

  if (PROTECTED.some((re) => re.test(pathname)) && !user) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.search = '';
    // Preserve where they were going so login can bounce them back.
    if (pathname !== '/') to.searchParams.set('next', pathname + search);
    return NextResponse.redirect(to);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/notes/:path*', '/settings/:path*'],
};
