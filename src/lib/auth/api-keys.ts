// src/lib/auth/api-keys.ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, apiKeys, users } from '@/lib/db';
import { HttpError } from '@/lib/http';
import type { ApiKey, SessionUser } from '@/lib/types';

const KEY_RE = /^kn_[0-9a-f]{32}$/;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** `kn_` + 32 hex (128 bit). Chỉ hiện đầy đủ một lần, sau đó chỉ còn hash. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'kn_' + randomBytes(16).toString('hex');
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

const toApiKey = (r: typeof apiKeys.$inferSelect): ApiKey => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  prefix: r.prefix,
  createdAt: r.createdAt.toISOString(),
  lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
});

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ apiKey: ApiKey; key: string }> {
  const trimmed = (name || '').trim() || 'API key';
  const { key, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: trimmed, prefix, tokenHash: hash })
    .returning();
  return { apiKey: toApiKey(row), key };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(toApiKey);
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
    .returning();
  if (!deleted.length) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy API key.');
}

/** Constant-time compare so a timing signal cannot reveal a stored hash. */
function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Tra khoá -> chủ sở hữu. Trả null với mọi khoá sai/rác. */
export async function resolveApiKey(key: string): Promise<SessionUser | null> {
  if (!KEY_RE.test(key || '')) return null;
  const hash = hashApiKey(key);

  const [row] = await db
    .select({
      keyId: apiKeys.id,
      tokenHash: apiKeys.tokenHash,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.tokenHash, hash))
    .limit(1);

  if (!row || !hashesEqual(row.tokenHash, hash)) return null;

  // Fire and forget: a failed timestamp update must not fail the request.
  void Promise.resolve(
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.keyId)),
  ).catch(() => {});

  return { id: row.id, username: row.username, displayName: row.displayName };
}
