// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SignJWT } from 'jose';

// Vitest does not load .env files; pin the signing secret for this suite.
process.env.AUTH_SECRET ||= 'test-only-secret-fixed-so-sessions-are-stable-000';

const { signSession, verifySession, SESSION_COOKIE, SESSION_MAX_AGE } = await import('./jwt');

const user = { id: 'u-1', username: 'bacsi', displayName: 'Bác sĩ' };

afterEach(() => vi.useRealTimers());

describe('session JWT', () => {
  it('names the cookie kn_session and lasts 30 days', () => {
    expect(SESSION_COOKIE).toBe('kn_session');
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it('round-trips the session user, including Vietnamese display names', async () => {
    const token = await signSession(user);
    expect(await verifySession(token)).toEqual(user);
  });

  it('produces a compact three-part JWS', async () => {
    expect((await signSession(user)).split('.')).toHaveLength(3);
  });

  it('returns null for a tampered payload', async () => {
    const token = await signSession(user);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...user, id: 'u-2' })).toString('base64url');
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const other = new TextEncoder().encode('a-completely-different-secret-value-01');
    const token = await new SignJWT({ username: 'x', displayName: 'X' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-9')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(other);
    expect(await verifySession(token)).toBeNull();
  });

  it('returns null for garbage and for an empty string', async () => {
    expect(await verifySession('not.a.jwt')).toBeNull();
    expect(await verifySession('')).toBeNull();
  });

  it('returns null once the token has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const token = await signSession(user);
    vi.setSystemTime(new Date('2024-02-05T00:00:00Z')); // 35 days later
    expect(await verifySession(token)).toBeNull();
  });

  it('still verifies at 29 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const token = await signSession(user);
    vi.setSystemTime(new Date('2024-01-30T00:00:00Z'));
    expect(await verifySession(token)).toEqual(user);
  });
});
