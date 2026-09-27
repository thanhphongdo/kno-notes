/**
 * Luồng OAuth cho MCP remote.
 *
 * Đây là thứ cho phép một client KHÔNG cho dán API key tĩnh — claude.ai là ví
 * dụ — kết nối được: nó gọi endpoint, nhận 401, lần theo con trỏ trong header
 * để tìm tài liệu mô tả, tự đăng ký, rồi đưa người dùng qua màn hình đồng ý.
 *
 * Spec này đi hết chuỗi đó bằng HTTP thật, và quan trọng hơn: nó canh những
 * chỗ mà làm sai thì mất tài khoản — mã dùng lại được, mã đổi được bởi client
 * khác, PKCE bỏ qua được, hay chuyển hướng tới một địa chỉ chưa đăng ký.
 */
import { createHash, randomBytes } from 'node:crypto';
import { test, expect, type Page } from './fixtures/auth';

/**
 * Địa chỉ quay về nằm ngay trên origin của app: `http` trên máy cục bộ đúng là
 * thứ các client chạy trên desktop dùng, và nhờ thế trình duyệt ở lại cùng
 * origin nên `fetch` tương đối sau đó vẫn gọi được API. Đường dẫn này không có
 * route nào — trang 404 là đủ, thứ ta cần là các tham số trên URL.
 */
const CALLBACK_PATH = '/e2e-oauth-callback';
const callbackFor = (page: Page) => new URL(CALLBACK_PATH, page.url()).toString();

const base64url = (b: Buffer) =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const challengeFor = (verifier: string) =>
  base64url(createHash('sha256').update(verifier, 'ascii').digest());

/** Đăng ký một client mới, như một MCP client sẽ tự làm. */
async function register(page: Page, redirectUri?: string): Promise<string> {
  const uri = redirectUri ?? callbackFor(page);
  const res = await page.evaluate(
    async ([target]) => {
      const r = await fetch('/api/oauth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Client kiểm thử', redirect_uris: [target] }),
      });
      return { status: r.status, body: await r.json() };
    },
    [uri],
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { client_id: string }).client_id;
}

/** Bấm Đồng ý trên màn hình đồng ý và bắt lấy URL quay về. */
async function approve(page: Page, url: string): Promise<URL> {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Cấp quyền truy cập' })).toBeVisible();
  await page.getByRole('button', { name: 'Đồng ý' }).click();
  await page.waitForURL(new RegExp(CALLBACK_PATH));
  return new URL(page.url());
}

function authorizeUrl(
  page: Page,
  clientId: string,
  challenge: string,
  extra: Record<string, string> = {},
) {
  const sp = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackFor(page),
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-123',
    ...extra,
  });
  return `/oauth/authorize?${sp}`;
}

async function exchange(page: Page, body: Record<string, string>) {
  return page.evaluate(async (payload) => {
    const r = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json() };
  }, body);
}

test.describe('OAuth cho MCP', () => {
  test('máy chủ tự mô tả đủ để một client lần ra đường đăng nhập', async ({ page }) => {
    await page.goto('/');

    const res = await page.evaluate(async () => {
      const r = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      return { status: r.status, auth: r.headers.get('www-authenticate') };
    });

    expect(res.status).toBe(401);
    // Không có con trỏ này thì client chỉ thấy một cái 401 câm.
    expect(res.auth).toContain('resource_metadata=');

    const docs = await page.evaluate(async () => {
      const [pr, as] = await Promise.all([
        fetch('/.well-known/oauth-protected-resource').then((r) => r.json()),
        fetch('/.well-known/oauth-authorization-server').then((r) => r.json()),
      ]);
      return { pr, as };
    });

    expect(docs.pr.resource).toMatch(/\/api\/mcp$/);
    expect(docs.as.authorization_endpoint).toMatch(/\/oauth\/authorize$/);
    expect(docs.as.token_endpoint).toMatch(/\/api\/oauth\/token$/);
    expect(docs.as.code_challenge_methods_supported).toEqual(['S256']);
  });

  test('đi trọn luồng: đăng ký, đồng ý, đổi mã, gọi được MCP', async ({ page }) => {
    await page.goto('/');
    const clientId = await register(page);
    const verifier = randomBytes(48).toString('hex');

    const back = await approve(page, authorizeUrl(page, clientId, challengeFor(verifier)));
    const code = back.searchParams.get('code');
    expect(code, 'phải nhận được mã uỷ quyền').toBeTruthy();
    // `state` quay về nguyên vẹn là thứ client dùng để phát hiện callback giả.
    expect(back.searchParams.get('state')).toBe('state-123');

    const token = await exchange(page, {
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: callbackFor(page),
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(token.status, JSON.stringify(token.body)).toBe(200);
    expect(token.body.token_type).toBe('Bearer');
    expect(token.body.access_token).toBeTruthy();
    expect(token.body.refresh_token).toBeTruthy();

    // Và token đó thật sự mở được MCP.
    const call = await page.evaluate(async (accessToken) => {
      const r = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      // Streamable HTTP trả về một dòng `data:`; lấy JSON ra khỏi nó.
      const text = await r.text();
      const line = text.split('\n').find((l) => l.startsWith('data: ')) ?? text;
      return { status: r.status, body: JSON.parse(line.replace(/^data: /, '')) as unknown };
    }, token.body.access_token as string);

    expect(call.status).toBe(200);
    const tools = (call.body as { result?: { tools?: { name: string }[] } }).result?.tools ?? [];
    expect(tools.map((t) => t.name)).toContain('set_quiz_questions');
  });

  test('refresh token đổi được access token mới', async ({ page }) => {
    await page.goto('/');
    const clientId = await register(page);
    const verifier = randomBytes(48).toString('hex');
    const back = await approve(page, authorizeUrl(page, clientId, challengeFor(verifier)));

    const first = await exchange(page, {
      grant_type: 'authorization_code',
      code: back.searchParams.get('code')!,
      redirect_uri: callbackFor(page),
      client_id: clientId,
      code_verifier: verifier,
    });

    const again = await exchange(page, {
      grant_type: 'refresh_token',
      refresh_token: first.body.refresh_token as string,
      client_id: clientId,
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.access_token).toBeTruthy();
  });

  test('từ chối thì client nhận access_denied, không nhận mã', async ({ page }) => {
    await page.goto('/');
    const clientId = await register(page);

    await page.goto(authorizeUrl(page, clientId, challengeFor('v'.repeat(64))));
    await page.getByRole('button', { name: 'Từ chối' }).click();
    await page.waitForURL(new RegExp(CALLBACK_PATH));

    const back = new URL(page.url());
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.has('code')).toBe(false);
  });

  test.describe('những chỗ làm sai thì mất tài khoản', () => {
    test('mã uỷ quyền chỉ đổi được một lần', async ({ page }) => {
      await page.goto('/');
      const clientId = await register(page);
      const verifier = randomBytes(48).toString('hex');
      const back = await approve(page, authorizeUrl(page, clientId, challengeFor(verifier)));
      const payload = {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        redirect_uri: callbackFor(page),
        client_id: clientId,
        code_verifier: verifier,
      };

      expect((await exchange(page, payload)).status).toBe(200);
      const second = await exchange(page, payload);
      expect(second.status).toBe(400);
      expect(second.body.error).toBe('invalid_grant');
    });

    test('sai code_verifier thì không đổi được, và mã cháy luôn', async ({ page }) => {
      await page.goto('/');
      const clientId = await register(page);
      const verifier = randomBytes(48).toString('hex');
      const back = await approve(page, authorizeUrl(page, clientId, challengeFor(verifier)));
      const code = back.searchParams.get('code')!;

      const wrong = await exchange(page, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackFor(page),
        client_id: clientId,
        code_verifier: randomBytes(48).toString('hex'),
      });
      expect(wrong.status).toBe(400);

      // Kể cả người xin mã thật cũng không dùng lại được nữa.
      const right = await exchange(page, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackFor(page),
        client_id: clientId,
        code_verifier: verifier,
      });
      expect(right.status).toBe(400);
    });

    test('thiếu code_verifier thì từ chối, không bỏ qua PKCE', async ({ page }) => {
      await page.goto('/');
      const clientId = await register(page);
      const verifier = randomBytes(48).toString('hex');
      const back = await approve(page, authorizeUrl(page, clientId, challengeFor(verifier)));

      const res = await exchange(page, {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        redirect_uri: callbackFor(page),
        client_id: clientId,
      });
      expect(res.status).toBe(400);
    });

    test('client khác không đổi được mã của client này', async ({ page }) => {
      await page.goto('/');
      const mine = await register(page);
      const other = await register(page);
      const verifier = randomBytes(48).toString('hex');
      const back = await approve(page, authorizeUrl(page, mine, challengeFor(verifier)));

      const stolen = await exchange(page, {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        redirect_uri: callbackFor(page),
        client_id: other,
        code_verifier: verifier,
      });
      expect(stolen.status).toBe(400);
    });

    /**
     * Chỗ nguy hiểm nhất: nếu server chuyển hướng tới một địa chỉ client chưa
     * đăng ký, chỉ cần dụ chủ tài khoản bấm một đường link là mã bay sang máy
     * kẻ tấn công. Phải dừng lại và hiện lỗi tại chỗ.
     */
    test('không chuyển hướng tới địa chỉ chưa đăng ký', async ({ page }) => {
      await page.goto('/');
      const clientId = await register(page);
      const sp = new URLSearchParams({
        client_id: clientId,
        redirect_uri: 'https://evil.test/steal',
        response_type: 'code',
        code_challenge: challengeFor('v'.repeat(64)),
        code_challenge_method: 'S256',
      });

      await page.goto(`/oauth/authorize?${sp}`);
      await expect(page.getByRole('heading', { name: 'Không cấp quyền được' })).toBeVisible();
      // Vẫn ở lại màn hình đồng ý; trình duyệt KHÔNG hề đi tới evil.test.
      expect(new URL(page.url()).pathname).toBe('/oauth/authorize');
      expect(new URL(page.url()).host).not.toContain('evil.test');
    });

    test('client lạ thì dừng ngay, không hỏi gì người dùng', async ({ page }) => {
      await page.goto('/');
      const sp = new URLSearchParams({
        client_id: 'knc_khong_ton_tai',
        redirect_uri: callbackFor(page),
        response_type: 'code',
        code_challenge: challengeFor('v'.repeat(64)),
        code_challenge_method: 'S256',
      });
      await page.goto(`/oauth/authorize?${sp}`);
      await expect(page.getByRole('heading', { name: 'Không cấp quyền được' })).toBeVisible();
    });

    test('không đăng ký nổi một địa chỉ http ngoài máy cục bộ', async ({ page }) => {
      await page.goto('/');
      const res = await page.evaluate(async () => {
        const r = await fetch('/api/oauth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirect_uris: ['http://evil.test/cb'] }),
        });
        return { status: r.status, body: await r.json() };
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
    });

    test('chưa đăng nhập thì màn hình đồng ý đẩy về trang đăng nhập', async ({ browser }) => {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const fresh = await context.newPage();
        await fresh.goto('/oauth/authorize?client_id=knc_x&redirect_uri=https%3A%2F%2Fexample.test%2Fcb');
        await expect(fresh).toHaveURL(/\/login/);
      } finally {
        await context.close();
      }
    });
  });
});
