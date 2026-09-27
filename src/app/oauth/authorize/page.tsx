import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { MCP_SCOPE } from '@/lib/auth/oauth';
import { checkAuthorize, readAuthorizeParams, redirectBack } from '@/lib/auth/oauth-request';
import { getClient } from '@/lib/auth/oauth-store';
import { loginPath } from '@/lib/nav/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const toParams = (raw: Search): URLSearchParams => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === 'string') sp.set(k, v[0]);
  }
  return sp;
};

/**
 * Màn hình đồng ý.
 *
 * Đây là chỗ DUY NHẤT quyền được cấp, nên nó phải nói thật và nói đủ: ứng dụng
 * nào đang hỏi, mã sẽ được gửi về đâu, và quyền này rộng tới đâu. Tên ứng dụng
 * do chính nó tự khai lúc đăng ký nên không đáng tin — vì vậy màn hình hiện cả
 * HOST của địa chỉ quay về, thứ không thể giả được.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const sp = toParams(raw);
  const params = readAuthorizeParams(sp);

  const session = await getSession();
  if (!session) redirect(`${loginPath()}?next=${encodeURIComponent(`/oauth/authorize?${sp}`)}`);

  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? '';
  const origin = `${head.get('x-forwarded-proto') ?? 'https'}://${host}`;

  const client = await getClient(params.clientId);
  const check = checkAuthorize(params, client, origin);

  if (check.kind === 'redirect') {
    redirect(
      redirectBack(
        params.redirectUri,
        { error: check.error, error_description: check.description },
        params.state,
      ),
    );
  }

  if (check.kind === 'fatal') {
    return (
      <Shell title="Không cấp quyền được">
        <p className="m-0 text-14 leading-[1.6] text-muted">{check.message}</p>
      </Shell>
    );
  }

  const target = new URL(params.redirectUri);

  return (
    <Shell title="Cấp quyền truy cập">
      <p className="m-0 text-14 leading-[1.6] text-muted">
        <strong className="font-semibold text-text">{client!.name}</strong> muốn truy cập ghi chú
        Kno-Notes của <strong className="font-semibold text-text">{session.displayName}</strong>.
      </p>

      <div className="flex flex-col gap-8 rounded-12 bg-surface2 py-14 px-16 text-13 leading-[1.6]">
        <div className="font-medium text-text">Nếu đồng ý, ứng dụng này sẽ được phép:</div>
        <ul className="m-0 flex list-disc flex-col gap-4 pl-18 text-muted">
          <li>Đọc mọi ghi chú, thẻ, ảnh và lịch sử trắc nghiệm của bạn</li>
          <li>Tạo, sửa và soạn câu hỏi cho ghi chú</li>
          <li>
            <strong className="font-semibold text-hi">Xoá vĩnh viễn</strong> ghi chú cùng mọi phiên
            bản của nó
          </li>
        </ul>
      </div>

      <div className="text-12 leading-[1.6] text-faint">
        Mã uỷ quyền sẽ được gửi về{' '}
        <code className="font-mono text-text">{target.host}</code>. Nếu bạn không nhận ra địa chỉ
        này, hãy từ chối.
      </div>

      <form method="post" action="/api/oauth/authorize" className="flex flex-wrap gap-8">
        {[...sp.entries()].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="scope" value={params.scope || MCP_SCOPE} />
        <Button type="submit" name="decision" value="allow" variant="primary" size="42">
          Đồng ý
        </Button>
        <Button
          type="submit"
          name="decision"
          value="deny"
          variant="secondary"
          size="42"
          className="border-line2"
        >
          Từ chối
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-24 text-text">
      <div className="flex w-full max-w-440 flex-col gap-16 rounded-14 border border-line bg-surface py-28 px-28 shadow-card">
        <div className="flex items-center gap-10">
          <span
            aria-hidden="true"
            className="flex h-32 w-32 items-center justify-center rounded-9 bg-accent font-serif text-17 font-bold text-accent-ink"
          >
            K
          </span>
          <h1 className="m-0 font-serif text-22 font-semibold">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
