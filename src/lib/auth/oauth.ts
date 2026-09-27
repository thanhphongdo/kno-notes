// src/lib/auth/oauth.ts
//
// Lớp OAuth 2.1 cho MCP remote.
//
// Vì sao cần: client như claude.ai không cho dán API key tĩnh. Chúng gọi
// endpoint, nhận 401, đọc con trỏ trong `WWW-Authenticate` để tìm tài liệu mô
// tả, tự đăng ký lấy `client_id`, rồi đưa người dùng qua một trang đăng nhập.
// Toàn bộ khối này là để trả lời chuỗi câu hỏi đó.
//
// Các mốc chuẩn: RFC 9728 (protected resource metadata), RFC 8414
// (authorization server metadata), RFC 7591 (dynamic client registration),
// RFC 7636 (PKCE), RFC 8707 (resource indicators).

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** Quyền duy nhất hiện có: đọc và ghi mọi ghi chú của tài khoản. */
export const MCP_SCOPE = 'mcp';

/** Access token sống ngắn vì nó là JWT tự chứa, không thu hồi được. */
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
/** Refresh token dài hơn, nhưng vẫn phải đổi lại định kỳ. */
export const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30;
/** Mã uỷ quyền chỉ sống đủ để client đổi lấy token. */
export const AUTH_CODE_TTL_SEC = 600;

const ALG = 'HS256';

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(s);
}

export const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── PKCE ────────────────────────────────────────────────────────────────────

/** `S256`: thử thách là base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier, 'ascii').digest());
}

/**
 * So sánh trong thời gian hằng định. PKCE là thứ duy nhất ràng buộc mã uỷ
 * quyền với đúng client đã xin nó, nên rò rỉ thông tin qua thời gian so sánh ở
 * đây là rò rỉ đúng chỗ không nên rò.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const a = Buffer.from(pkceChallenge(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── redirect URI ────────────────────────────────────────────────────────────

/**
 * URI quay về mà ta chấp nhận cho một client tự đăng ký.
 *
 * `https` ở bất kỳ đâu, hoặc `http` NHƯNG chỉ trên máy cục bộ — đó là cách các
 * client chạy trên desktop nhận mã trả về. `http` tới một host bất kỳ thì mã
 * uỷ quyền sẽ đi qua mạng dưới dạng chữ thường, nên không nhận.
 */
export function isAllowedRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false; // fragment không có chỗ trong redirect_uri
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
}

/**
 * So khớp TUYỆT ĐỐI theo chuỗi, không so theo tiền tố, không bỏ qua query.
 * Khớp lỏng ở đây là cách kinh điển để mã uỷ quyền bị chuyển hướng đi nơi khác.
 */
export function matchRedirectUri(registered: readonly string[], requested: string): boolean {
  return registered.includes(requested);
}

// ── định danh ───────────────────────────────────────────────────────────────

export const newClientId = (): string => `knc_${randomBytes(16).toString('hex')}`;
export const newAuthCode = (): string => `kna_${randomBytes(32).toString('hex')}`;

/** Mã uỷ quyền được lưu dưới dạng băm, như API key. */
export const hashAuthCode = (code: string): string =>
  createHash('sha256').update(code, 'utf8').digest('hex');

// ── token ───────────────────────────────────────────────────────────────────

/**
 * `typ` là thứ tách token OAuth khỏi cookie phiên. Cả hai cùng ký bằng
 * `AUTH_SECRET`, nên thiếu nó thì một cookie phiên đánh cắp được có thể dùng
 * làm bearer token và ngược lại.
 */
export type TokenType = 'at' | 'rt';

export interface AccessTokenClaims {
  userId: string;
  clientId: string;
  resource: string;
  scope: string;
}

async function sign(type: TokenType, claims: AccessTokenClaims, ttlSec: number): Promise<string> {
  return new SignJWT({
    typ: type,
    client_id: claims.clientId,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.userId)
    .setAudience(claims.resource)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(secret());
}

export const signAccessToken = (c: AccessTokenClaims): Promise<string> =>
  sign('at', c, ACCESS_TOKEN_TTL_SEC);

export const signRefreshToken = (c: AccessTokenClaims): Promise<string> =>
  sign('rt', c, REFRESH_TOKEN_TTL_SEC);

/** Trả null với MỌI lỗi — sai chữ ký, hết hạn, sai loại, rác. Không ném. */
export async function verifyToken(
  token: string,
  expected: TokenType,
): Promise<AccessTokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (payload.typ !== expected) return null;
    const userId = payload.sub;
    const clientId = payload.client_id;
    const scope = payload.scope;
    const aud = payload.aud;
    if (typeof userId !== 'string' || typeof clientId !== 'string') return null;
    return {
      userId,
      clientId,
      resource: typeof aud === 'string' ? aud : Array.isArray(aud) ? String(aud[0] ?? '') : '',
      scope: typeof scope === 'string' ? scope : MCP_SCOPE,
    };
  } catch {
    return null;
  }
}

// ── tài liệu mô tả ──────────────────────────────────────────────────────────

export const mcpResourceUrl = (origin: string): string => `${origin}/api/mcp`;

/** RFC 9728 — "tài nguyên này do ai bảo vệ". */
export function protectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Kno-Notes',
    resource_documentation: `${origin}/settings/api-keys`,
  };
}

/** RFC 8414 — "muốn xin token thì đi đâu". */
export function authorizationServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // Client công khai + PKCE. Không phát client_secret, nên không có gì để lộ
    // trong file cấu hình trên máy người dùng.
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: `${origin}/settings/api-keys`,
  };
}

/** Header 401 trỏ client tới tài liệu mô tả — thiếu nó thì không ai tìm ra. */
export function wwwAuthenticate(origin: string): string {
  return `Bearer realm="kno-notes", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

/**
 * Origin công khai của request.
 *
 * Phải suy từ chính request chứ không hard-code: mỗi bản deploy xem trước của
 * Vercel có một host khác, và tài liệu mô tả phải trỏ về đúng host đang gọi,
 * nếu không client sẽ đi xin token ở nhầm nơi.
 */
export function originOf(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost) return `${forwardedProto || 'https'}://${forwardedHost}`;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
