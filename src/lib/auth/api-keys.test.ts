// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, apiKeys, closeDb } from '@/lib/db';
import { makeUser, dropUser } from '@/lib/services/helpers';
import {
  generateApiKey,
  hashApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
} from './api-keys';

let userA = '';
let userB = '';

beforeAll(async () => {
  userA = await makeUser('key_a');
  userB = await makeUser('key_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await closeDb();
});

describe('generateApiKey', () => {
  it('produces kn_ followed by 32 hex characters', () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^kn_[0-9a-f]{32}$/);
    expect(key).toHaveLength(35);
  });

  it('takes the prefix from the first 10 characters', () => {
    const { key, prefix } = generateApiKey();
    expect(prefix).toBe(key.slice(0, 10));
    expect(prefix.startsWith('kn_')).toBe(true);
  });

  it('hashes with sha256, producing 64 hex characters', () => {
    const { key, hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(key));
  });

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });
});

describe('createApiKey', () => {
  it('returns the plaintext key once and stores only its hash', async () => {
    const { apiKey, key } = await createApiKey(userA, 'Claude Desktop');
    expect(key).toMatch(/^kn_[0-9a-f]{32}$/);
    expect(apiKey.name).toBe('Claude Desktop');
    expect(apiKey.prefix).toBe(key.slice(0, 10));
    expect(JSON.stringify(apiKey)).not.toContain(key);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row.tokenHash).toBe(hashApiKey(key));
    expect(row.tokenHash).not.toContain(key);
  });

  it('lists keys without ever exposing the hash', async () => {
    await createApiKey(userA, 'Codex');
    const list = await listApiKeys(userA);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(list)).not.toContain('tokenHash');
    for (const k of list) expect(Object.keys(k)).not.toContain('tokenHash');
  });

  it('never lists another user keys', async () => {
    await createApiKey(userB, 'B key');
    const list = await listApiKeys(userA);
    expect(list.some((k) => k.name === 'B key')).toBe(false);
  });
});

describe('resolveApiKey', () => {
  it('resolves a valid key to its owner', async () => {
    const { key } = await createApiKey(userA, 'resolve me');
    const user = await resolveApiKey(key);
    expect(user).toMatchObject({ id: userA, username: 'key_a' });
  });

  it('records lastUsedAt', async () => {
    const { apiKey, key } = await createApiKey(userA, 'touch me');
    expect(apiKey.lastUsedAt).toBeNull();
    await resolveApiKey(key);
    await new Promise((r) => setTimeout(r, 50));
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('returns null for an unknown, malformed or empty key', async () => {
    expect(await resolveApiKey('kn_' + '0'.repeat(32))).toBeNull();
    expect(await resolveApiKey('not-a-key')).toBeNull();
    expect(await resolveApiKey('')).toBeNull();
  });

  it('returns null once revoked', async () => {
    const { apiKey, key } = await createApiKey(userA, 'revoke me');
    expect(await resolveApiKey(key)).not.toBeNull();
    await revokeApiKey(userA, apiKey.id);
    expect(await resolveApiKey(key)).toBeNull();
  });

  it('refuses to revoke another user key', async () => {
    const { apiKey, key } = await createApiKey(userA, 'not yours');
    await expect(revokeApiKey(userB, apiKey.id)).rejects.toMatchObject({ status: 404 });
    expect(await resolveApiKey(key)).not.toBeNull();
  });
});
