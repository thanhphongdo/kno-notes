// src/lib/auth/oauth-store.ts
//
// Phần OAuth cần chạm cơ sở dữ liệu: client tự đăng ký và mã uỷ quyền.
// Tách khỏi `oauth.ts` để file kia vẫn thuần và test được không cần DB.

import { and, eq, lt } from 'drizzle-orm';
import { db, oauthClients, oauthCodes } from '@/lib/db';
import { HttpError } from '@/lib/http';
import {
  AUTH_CODE_TTL_SEC,
  hashAuthCode,
  isAllowedRedirectUri,
  matchRedirectUri,
  newAuthCode,
  newClientId,
} from './oauth';

export interface RegisteredClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}

/** RFC 7591: client tự khai, server chỉ kiểm URI quay về. */
export async function registerClient(
  name: string,
  redirectUris: readonly string[],
): Promise<RegisteredClient> {
  const uris = [...new Set(redirectUris.map((u) => u.trim()).filter(Boolean))];
  if (!uris.length) {
    throw new HttpError(400, 'INVALID_REDIRECT_URI', 'Cần ít nhất một redirect_uri.');
  }
  const bad = uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) {
    throw new HttpError(
      400,
      'INVALID_REDIRECT_URI',
      `redirect_uri không được chấp nhận: ${bad}. Chỉ nhận https, hoặc http trên máy cục bộ.`,
    );
  }

  const clientId = newClientId();
  await db.insert(oauthClients).values({
    clientId,
    name: (name || '').trim().slice(0, 120) || 'MCP client',
    redirectUris: uris,
  });
  return { clientId, name, redirectUris: uris };
}

export async function getClient(clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const [row] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return row ? { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris } : null;
}

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

/** Phát mã uỷ quyền; chỉ băm được lưu lại. Trả về mã gốc đúng một lần. */
export async function issueAuthCode(input: IssueCodeInput): Promise<string> {
  const code = newAuthCode();
  await db.insert(oauthCodes).values({
    codeHash: hashAuthCode(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000),
  });
  return code;
}

export interface ConsumedCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

/**
 * Đổi mã lấy quyền, và XOÁ nó đi.
 *
 * Xoá trước khi kiểm PKCE là có chủ ý: một mã bị lộ mà kẻ tấn công thử sai
 * `code_verifier` thì mã đó cũng cháy luôn, không còn cho ai dùng lại.
 */
export async function consumeAuthCode(
  code: string,
  clientId: string,
): Promise<ConsumedCode | null> {
  const codeHash = hashAuthCode(code || '');
  const [row] = await db
    .select()
    .from(oauthCodes)
    .where(and(eq(oauthCodes.codeHash, codeHash), eq(oauthCodes.clientId, clientId)))
    .limit(1);
  if (!row) return null;

  await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, codeHash));
  if (row.expiresAt.getTime() < Date.now()) return null;

  return {
    userId: row.userId,
    clientId: row.clientId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    scope: row.scope,
    resource: row.resource,
  };
}

/** Dọn mã đã hết hạn. Gọi tiện thể ở đường phát mã, không cần cron. */
export async function pruneExpiredCodes(): Promise<void> {
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date()));
}

/** Kiểm redirect_uri của một yêu cầu uỷ quyền so với những gì client đã đăng ký. */
export function redirectUriAllowed(client: RegisteredClient, requested: string): boolean {
  return matchRedirectUri(client.redirectUris, requested);
}
