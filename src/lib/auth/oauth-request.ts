// src/lib/auth/oauth-request.ts
// Kiểm một yêu cầu uỷ quyền. Thuần và không chạm mạng, nên test được thẳng.

import { MCP_SCOPE, mcpResourceUrl } from './oauth';
import { redirectUriAllowed, type RegisteredClient } from './oauth-store';

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  resource: string;
}

export function readAuthorizeParams(sp: URLSearchParams): AuthorizeParams {
  return {
    clientId: sp.get('client_id') ?? '',
    redirectUri: sp.get('redirect_uri') ?? '',
    responseType: sp.get('response_type') ?? '',
    codeChallenge: sp.get('code_challenge') ?? '',
    codeChallengeMethod: sp.get('code_challenge_method') ?? '',
    state: sp.get('state') ?? '',
    scope: sp.get('scope') ?? MCP_SCOPE,
    resource: sp.get('resource') ?? '',
  };
}

/**
 * Hai loại lỗi rất khác nhau:
 *
 *  • `fatal` — client_id sai, hoặc redirect_uri không phải cái đã đăng ký. Khi
 *    đó TUYỆT ĐỐI không được chuyển hướng: ta không biết cái URI kia là của ai,
 *    và chuyển hướng tới đó là tự tay gửi mã cho người lạ. Phải hiện lỗi tại
 *    chỗ.
 *  • `redirect` — mọi lỗi còn lại. redirect_uri đã xác thực rồi, nên trả lỗi
 *    về đúng client theo chuẩn để nó hiện thông báo tử tế.
 */
export type AuthorizeCheck =
  | { kind: 'ok'; resource: string }
  | { kind: 'fatal'; message: string }
  | { kind: 'redirect'; error: string; description: string };

export function checkAuthorize(
  params: AuthorizeParams,
  client: RegisteredClient | null,
  origin: string,
): AuthorizeCheck {
  if (!client) {
    return { kind: 'fatal', message: 'Ứng dụng yêu cầu quyền không tồn tại hoặc đã bị gỡ.' };
  }
  if (!params.redirectUri || !redirectUriAllowed(client, params.redirectUri)) {
    return {
      kind: 'fatal',
      message: 'Địa chỉ quay về không khớp với địa chỉ ứng dụng đã đăng ký.',
    };
  }
  if (params.responseType !== 'code') {
    return {
      kind: 'redirect',
      error: 'unsupported_response_type',
      description: 'Chỉ hỗ trợ response_type=code.',
    };
  }
  if (!params.codeChallenge) {
    return { kind: 'redirect', error: 'invalid_request', description: 'Thiếu code_challenge.' };
  }
  if (params.codeChallengeMethod !== 'S256') {
    return {
      kind: 'redirect',
      error: 'invalid_request',
      description: 'Chỉ hỗ trợ code_challenge_method=S256.',
    };
  }
  return { kind: 'ok', resource: params.resource || mcpResourceUrl(origin) };
}

/** Dựng URL quay về, giữ nguyên `state` để client chống CSRF. */
export function redirectBack(
  redirectUri: string,
  params: Record<string, string>,
  state: string,
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}
