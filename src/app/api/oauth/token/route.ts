import {
  ACCESS_TOKEN_TTL_SEC,
  MCP_SCOPE,
  mcpResourceUrl,
  originOf,
  signAccessToken,
  signRefreshToken,
  verifyPkce,
  verifyToken,
} from '@/lib/auth/oauth';
import { CORS, oauthError, preflight } from '@/lib/auth/oauth-http';
import { consumeAuthCode, getClient } from '@/lib/auth/oauth-store';

export const runtime = 'nodejs';

/**
 * Đổi mã uỷ quyền (hoặc refresh token) lấy access token.
 *
 * Client ở đây là client CÔNG KHAI: không có `client_secret`, nên thứ duy nhất
 * chứng minh "tôi chính là bên đã xin mã này" là PKCE. Vì vậy mọi kiểm tra
 * dưới đây đều bắt buộc, không cái nào là tuỳ chọn:
 *   • mã phải tồn tại và chưa dùng (bảng chỉ giữ băm, và xoá ngay khi đọc);
 *   • `client_id` phải khớp với client đã xin mã;
 *   • `redirect_uri` phải khớp đúng cái đã dùng lúc xin;
 *   • `code_verifier` phải băm ra đúng `code_challenge` đã lưu.
 */
async function readForm(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = (await req.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
  }
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

const tokenResponse = (accessToken: string, refreshToken: string, scope: string) =>
  Response.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      scope,
    },
    { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  );

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await readForm(req);
  } catch {
    return oauthError(400, 'invalid_request', 'Không đọc được thân yêu cầu.');
  }

  const grantType = body.grant_type ?? '';
  const clientId = body.client_id ?? '';
  const origin = originOf(req);

  if (!clientId) return oauthError(400, 'invalid_client', 'Thiếu client_id.');
  const client = await getClient(clientId);
  if (!client) return oauthError(401, 'invalid_client', 'client_id không tồn tại.');

  if (grantType === 'authorization_code') {
    const code = body.code ?? '';
    const redirectUri = body.redirect_uri ?? '';
    const verifier = body.code_verifier ?? '';
    if (!code) return oauthError(400, 'invalid_request', 'Thiếu code.');
    if (!verifier) return oauthError(400, 'invalid_request', 'Thiếu code_verifier (PKCE bắt buộc).');

    const granted = await consumeAuthCode(code, clientId);
    if (!granted) return oauthError(400, 'invalid_grant', 'Mã uỷ quyền không hợp lệ hoặc đã dùng.');
    if (granted.redirectUri !== redirectUri) {
      return oauthError(400, 'invalid_grant', 'redirect_uri không khớp với lúc xin mã.');
    }
    if (!verifyPkce(verifier, granted.codeChallenge)) {
      return oauthError(400, 'invalid_grant', 'code_verifier không khớp.');
    }

    const claims = {
      userId: granted.userId,
      clientId,
      resource: granted.resource || mcpResourceUrl(origin),
      scope: granted.scope || MCP_SCOPE,
    };
    return tokenResponse(
      await signAccessToken(claims),
      await signRefreshToken(claims),
      claims.scope,
    );
  }

  if (grantType === 'refresh_token') {
    const claims = await verifyToken(body.refresh_token ?? '', 'rt');
    if (!claims) return oauthError(400, 'invalid_grant', 'Refresh token không hợp lệ hoặc hết hạn.');
    // Refresh token gắn với đúng client đã được cấp; đổi client là đổi chủ.
    if (claims.clientId !== clientId) {
      return oauthError(400, 'invalid_grant', 'Refresh token không thuộc client này.');
    }
    return tokenResponse(
      await signAccessToken(claims),
      await signRefreshToken(claims),
      claims.scope,
    );
  }

  return oauthError(400, 'unsupported_grant_type', `Không hỗ trợ grant_type "${grantType}".`);
}

export const OPTIONS = preflight;
