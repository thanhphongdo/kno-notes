import { execFileSync } from 'node:child_process';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { E2E_ENV } from '../playwright.config';

/**
 * The public surface AI clients use: `/api/v1` with a bearer API key
 * (SPEC §2.4) and the MCP Streamable-HTTP endpoint at `/api/mcp`.
 *
 * The key is minted the way a human would mint one — `scripts/make-key.ts`,
 * pointed at the e2e database — rather than through the app's own session
 * endpoint, so this file also proves that path works.
 *
 * Every request here is a raw `request` fixture call with no cookie jar: if a
 * route ever started falling back to the session cookie, these tests would
 * keep passing for the wrong reason, so the 401 cases below are load-bearing.
 */

const TOOLS = [
  'list_notes', 'search_notes', 'get_note', 'create_note', 'update_note',
  'delete_note', 'list_tags', 'create_quiz', 'list_quizzes',
] as const;

let token = '';

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test.beforeAll(() => {
  // `make-key.ts` prints the plaintext key on stdout and the confirmation on
  // stderr. `.env.test` must win over the developer's `.env.local`, which the
  // script loads itself — a shell variable always beats dotenv.
  const out = execFileSync('npx', ['tsx', 'scripts/make-key.ts', 'bacsi', 'e2e'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...E2E_ENV },
  });
  token = out.trim().split('\n').pop()!.trim();
  expect(token, 'make-key.ts must print a key').toMatch(/^kn_/);
});

test.describe('xác thực bearer', () => {
  test('thiếu header trả 401 kèm vỏ lỗi chuẩn', async ({ request }) => {
    const res = await request.get('/api/v1/notes');
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  test('bearer sai trả 401', async ({ request }) => {
    const res = await request.get('/api/v1/notes', {
      headers: { Authorization: 'Bearer kn_khong_ton_tai' },
    });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  test('ghi chú không tồn tại trả 404 với vỏ lỗi chuẩn', async ({ request }) => {
    const res = await request.get('/api/v1/notes/khong-co-that', { headers: auth() });
    expect(res.status()).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});

test.describe('/api/v1', () => {
  test('CRUD ghi chú, thẻ và quiz trong một vòng đời đầy đủ', async ({ request }) => {
    const headers = auth();

    // ── list ────────────────────────────────────────────────────────────────
    const list = await request.get('/api/v1/notes?page=1', { headers });
    expect(list.status()).toBe(200);
    const listed = (await list.json()) as {
      notes: { id: string; title: string }[];
      total: number;
      page: number;
      pages: number;
      pageSize: number;
    };
    expect(listed.notes.length).toBeGreaterThan(0);
    expect(listed.total).toBeGreaterThanOrEqual(listed.notes.length);
    expect(listed.page).toBe(1);

    // ── create ──────────────────────────────────────────────────────────────
    const created = await request.post('/api/v1/notes', {
      headers,
      data: {
        title: 'Ghi chú từ API',
        desc: 'Mô tả tạo bởi e2e',
        tags: ['API e2e'],
        priority: 'low',
        content: '<p>Xin chào từ Playwright.</p>',
      },
    });
    expect(created.status()).toBe(200);
    const { note, version } = (await created.json()) as {
      note: { id: string; title: string; versions: unknown[] };
      version: number;
    };
    expect(version).toBe(1);
    const id = note.id;

    // ── read ────────────────────────────────────────────────────────────────
    const read = await request.get(`/api/v1/notes/${id}`, { headers });
    expect(read.status()).toBe(200);
    const fetched = (await read.json()) as { note: { title: string; priority: string; tags: string[] } };
    expect(fetched.note.title).toBe('Ghi chú từ API');
    expect(fetched.note.priority).toBe('low');
    expect(fetched.note.tags).toEqual(['API e2e']);

    // ── update ──────────────────────────────────────────────────────────────
    const patched = await request.patch(`/api/v1/notes/${id}`, {
      headers,
      data: {
        title: 'Đã sửa qua API',
        desc: 'Mô tả tạo bởi e2e',
        tags: ['API e2e'],
        priority: 'high',
        content: '<p>Nội dung đã đổi.</p>',
      },
    });
    expect(patched.status()).toBe(200);
    // SPEC §3: a changed title or body bumps the version, nothing else does.
    expect(((await patched.json()) as { version: number }).version).toBe(2);

    // ── tags ────────────────────────────────────────────────────────────────
    const tags = await request.get('/api/v1/tags', { headers });
    expect(tags.status()).toBe(200);
    const { tags: tagList } = (await tags.json()) as { tags: { name: string; count: number }[] };
    expect(tagList.some((t) => t.name === 'API e2e')).toBe(true);
    // The seeded library is still there alongside the new tag.
    expect(tagList.some((t) => t.name === 'Tim mạch')).toBe(true);

    // ── quiz create + list ──────────────────────────────────────────────────
    const quizBody = {
      score: 1,
      total: 2,
      source: 'offline' as const,
      picks: [0, 1],
      questions: [
        { q: 'Câu một?', options: ['A', 'B', 'C', 'D'], answer: 0, explain: 'Vì A.' },
        { q: 'Câu hai?', options: ['A', 'B', 'C', 'D'], answer: 2, explain: 'Vì C.' },
      ],
    };
    const quizCreated = await request.post(`/api/v1/notes/${id}/quizzes`, { headers, data: quizBody });
    expect(quizCreated.status()).toBe(200);

    const quizzes = await request.get(`/api/v1/notes/${id}/quizzes`, { headers });
    expect(quizzes.status()).toBe(200);
    const { quizzes: stored } = (await quizzes.json()) as {
      quizzes: { id: string; score: number; total: number; questions: unknown[] }[];
    };
    expect(stored).toHaveLength(1);
    expect(stored[0].total).toBe(2);
    expect(stored[0].questions).toHaveLength(2);

    // ── delete ──────────────────────────────────────────────────────────────
    const removed = await request.delete(`/api/v1/notes/${id}`, { headers });
    expect(removed.status()).toBe(200);
    expect((await request.get(`/api/v1/notes/${id}`, { headers })).status()).toBe(404);
  });

  test('body sai kiểu trả 400 INVALID_INPUT, không phải 500', async ({ request }) => {
    const res = await request.post('/api/v1/notes', {
      headers: auth(),
      data: { title: 123, priority: 'urgent' },
    });
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
  });
});

test.describe('/api/mcp', () => {
  /** MCP Streamable HTTP answers either JSON or an SSE frame; both carry the body. */
  async function toolsList(request: APIRequestContext, bearer: string) {
    return request.post('/api/mcp', {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
  }

  test('tools/list trả đủ chín tool', async ({ request }) => {
    const res = await toolsList(request, token);
    expect(res.status()).toBe(200);
    const body = await res.text();
    for (const tool of TOOLS) {
      expect(body, `MCP must expose ${tool}`).toContain(`"${tool}"`);
    }
  });

  test('không có bearer trả 401 kèm WWW-Authenticate', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()['www-authenticate']).toContain('Bearer');
  });
});
