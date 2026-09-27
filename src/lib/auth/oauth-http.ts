// src/lib/auth/oauth-http.ts
// Vỏ HTTP dùng chung cho các endpoint OAuth.

/**
 * Metadata và token endpoint phải đọc được từ nơi khác: client chạy trong
 * trình duyệt (và một số bộ kiểm thử MCP) gọi chúng cross-origin. Chúng không
 * trả dữ liệu riêng tư và không đọc cookie, nên mở là an toàn.
 */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
} as const;

export const json = (body: unknown, init: ResponseInit = {}): Response =>
  Response.json(body, {
    ...init,
    headers: { ...CORS, 'Cache-Control': 'public, max-age=300', ...(init.headers ?? {}) },
  });

/** Lỗi theo đúng dạng RFC 6749 §5.2 — client đọc `error` để biết phải làm gì. */
export const oauthError = (status: number, error: string, description: string): Response =>
  Response.json(
    { error, error_description: description },
    { status, headers: { ...CORS, 'Cache-Control': 'no-store' } },
  );

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS });
