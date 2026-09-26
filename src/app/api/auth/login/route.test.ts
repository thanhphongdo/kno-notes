// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const setSessionCookie = vi.fn(async () => {});
vi.mock('@/lib/auth/session', () => ({
  setSessionCookie,
  clearSessionCookie: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
  requireUser: vi.fn(async () => {
    throw new Error('not used');
  }),
}));

const { POST } = await import('./route');
const { db, users, closeDb } = await import('@/lib/db');
const { hashPassword } = await import('@/lib/auth/password');

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  await db.delete(users).where(eq(users.username, 'login_test'));
  await db.insert(users).values({
    username: 'login_test',
    passwordHash: await hashPassword('123456'),
    displayName: 'Bác sĩ',
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.username, 'login_test'));
  await closeDb();
});

describe('POST /api/auth/login', () => {
  it('signs in with correct credentials and sets the session cookie', async () => {
    const res = await post({ username: 'login_test', password: '123456' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('login_test');
    expect(body.user.displayName).toBe('Bác sĩ');
    expect(body.user.id).toBeTruthy();
    expect(setSessionCookie).toHaveBeenCalledWith(body.user);
  });

  it('never returns the password hash', async () => {
    const res = await post({ username: 'login_test', password: '123456' });
    expect(JSON.stringify(await res.json())).not.toContain('$2');
  });

  it('rejects a wrong password with the exact prototype copy', async () => {
    const res = await post({ username: 'login_test', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Sai tên đăng nhập hoặc mật khẩu.' },
    });
  });

  it('gives the identical message for an unknown user, leaking nothing', async () => {
    const res = await post({ username: 'no_such_user', password: '123456' });
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe('Sai tên đăng nhập hoặc mật khẩu.');
  });

  it('trims surrounding whitespace in the username', async () => {
    const res = await post({ username: '  login_test  ', password: '123456' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing field with 400, not 500', async () => {
    const res = await post({ username: 'login_test' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });

  it('rejects an empty password with 400', async () => {
    const res = await post({ username: 'login_test', password: '' });
    expect(res.status).toBe(400);
  });
});
