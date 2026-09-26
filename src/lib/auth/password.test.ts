// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const h = await hashPassword('123456');
    expect(h).not.toBe('123456');
    expect(h.startsWith('$2')).toBe(true);
    expect(h.length).toBeGreaterThan(50);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('123456')).not.toBe(await hashPassword('123456'));
  });

  it('verifies a correct password', async () => {
    const h = await hashPassword('123456');
    expect(await verifyPassword('123456', h)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('123456');
    expect(await verifyPassword('1234567', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('returns false rather than throwing for a malformed hash', async () => {
    expect(await verifyPassword('123456', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('123456', '')).toBe(false);
  });

  it('handles Vietnamese and long passwords', async () => {
    const pw = 'Mật khẩu của bác sĩ 2024';
    expect(await verifyPassword(pw, await hashPassword(pw))).toBe(true);
  });
});
