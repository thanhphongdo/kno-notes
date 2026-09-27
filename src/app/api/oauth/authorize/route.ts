import { originOf } from '@/lib/auth/oauth';
import { checkAuthorize, readAuthorizeParams, redirectBack } from '@/lib/auth/oauth-request';
import { getClient, issueAuthCode, pruneExpiredCodes } from '@/lib/auth/oauth-store';
import { getSession } from '@/lib/auth/session';
import { loginPath } from '@/lib/nav/paths';

export const runtime = 'nodejs';

/**
 * Quyết định của người dùng trên màn hình đồng ý.
 *
 * Kiểm lại TOÀN BỘ tham số ở đây chứ không tin những gì form gửi lên: form là
 * dữ liệu từ trình duyệt, và trang hiển thị trước đó không ràng buộc được gì
 * với request này.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const sp = new URLSearchParams();
  for (const [k, v] of form.entries()) sp.set(k, String(v));

  const params = readAuthorizeParams(sp);
  const decision = sp.get('decision');

  const session = await getSession();
  if (!session) {
    return Response.redirect(new URL(loginPath(), originOf(req)).toString(), 303);
  }

  const client = await getClient(params.clientId);
  const check = checkAuthorize(params, client, originOf(req));

  // Không có redirect_uri đáng tin thì không chuyển hướng đi đâu cả.
  if (check.kind === 'fatal') {
    return Response.json({ error: 'invalid_request', error_description: check.message }, { status: 400 });
  }
  if (check.kind === 'redirect') {
    return Response.redirect(
      redirectBack(
        params.redirectUri,
        { error: check.error, error_description: check.description },
        params.state,
      ),
      303,
    );
  }

  if (decision !== 'allow') {
    return Response.redirect(
      redirectBack(
        params.redirectUri,
        { error: 'access_denied', error_description: 'Người dùng đã từ chối.' },
        params.state,
      ),
      303,
    );
  }

  void pruneExpiredCodes().catch(() => undefined);

  const code = await issueAuthCode({
    clientId: params.clientId,
    userId: session.id,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    scope: params.scope,
    resource: check.resource,
  });

  return Response.redirect(redirectBack(params.redirectUri, { code }, params.state), 303);
}
