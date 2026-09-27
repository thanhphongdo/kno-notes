import { z } from 'zod';
import { MCP_SCOPE } from '@/lib/auth/oauth';
import { oauthError, preflight } from '@/lib/auth/oauth-http';
import { registerClient } from '@/lib/auth/oauth-store';
import { CORS } from '@/lib/auth/oauth-http';
import { HttpError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * RFC 7591 — dynamic client registration.
 *
 * Mở cho mọi người gọi, và điều đó là đúng với chuẩn: đăng ký chỉ tạo ra một
 * `client_id` công khai, chưa cấp quyền gì cả. Quyền chỉ phát sinh khi CHỦ tài
 * khoản tự tay bấm đồng ý ở `/oauth/authorize`. Thứ duy nhất phải kiểm ở đây
 * là redirect_uri, vì đó là nơi mã uỷ quyền sẽ được gửi tới.
 */
const Body = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().min(1).max(2000)).min(1).max(10),
  // Các trường dưới đây client hay gửi kèm; ta nhận và bỏ qua thay vì từ chối.
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'Thiếu hoặc sai redirect_uris.');
  }

  try {
    const client = await registerClient(parsed.client_name ?? '', parsed.redirect_uris);
    return Response.json(
      {
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        // Client công khai: không có secret nào để giữ, PKCE thay thế.
        token_endpoint_auth_method: 'none',
        scope: MCP_SCOPE,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201, headers: { ...CORS, 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    if (e instanceof HttpError) return oauthError(400, 'invalid_redirect_uri', e.message);
    console.error('[oauth/register]', e);
    return oauthError(500, 'server_error', 'Không đăng ký được client.');
  }
}

export const OPTIONS = preflight;
