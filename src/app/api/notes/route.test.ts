// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@/lib/types';

const session = { current: null as null | { id: string; username: string; displayName: string } };
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(async () => session.current),
  requireUser: vi.fn(async () => {
    if (!session.current) {
      const { HttpError } = await import('@/lib/http');
      throw new HttpError(401, 'UNAUTHORIZED', 'Chưa đăng nhập.');
    }
    return session.current;
  }),
  setSessionCookie: vi.fn(async () => {}),
  clearSessionCookie: vi.fn(async () => {}),
}));

const { GET, POST } = await import('./route');
const single = await import('./[id]/route');
const fav = await import('./[id]/favorite/route');
const comments = await import('./[id]/comments/route');
const comment = await import('./[id]/comments/[commentId]/route');
const highlights = await import('./[id]/highlights/route');
const restore = await import('./[id]/versions/[v]/restore/route');
const quizzes = await import('./[id]/quizzes/route');
const tagsRoute = await import('../tags/route');
const prefsRoute = await import('../prefs/route');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { closeDb } = await import('@/lib/db');

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const body = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch'],
  priority: 'high',
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

const jsonReq = (url: string, method: string, payload?: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

const create = () => POST(jsonReq('http://x/api/notes', 'POST', body));
const list = (qs = '') => GET(new Request(`http://x/api/notes${qs}`));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('route_a');
  userB = await makeUser('route_b');
  session.current = { id: userA, username: 'route_a', displayName: 'A' };
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('auth gate', () => {
  it('401s every notes route when signed out', async () => {
    const saved = session.current;
    session.current = null;
    expect((await list()).status).toBe(401);
    expect((await create()).status).toBe(401);
    expect((await tagsRoute.GET()).status).toBe(401);
    expect((await prefsRoute.GET()).status).toBe(401);
    session.current = saved;
  });
});

describe('POST + GET /api/notes', () => {
  it('creates a note at v1 and returns it', async () => {
    const res = await create();
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.version).toBe(1);
    expect(out.note.title).toBe(body.title);
  });

  it(`lists with the default page size of ${DEFAULT_PAGE_SIZE}`, async () => {
    const out = await (await list()).json();
    expect(out.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(out.notes.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
    expect(out.page).toBe(1);
  });

  it('filters by query, priority and tag from the query string', async () => {
    expect((await (await list('?q=huyet%20ap')).json()).total).toBeGreaterThan(0);
    expect((await (await list('?priority=low')).json()).total).toBe(0);
    expect((await (await list('?tag=Tim%20m%E1%BA%A1ch')).json()).total).toBeGreaterThan(0);
  });

  it('400s on an invalid body', async () => {
    const res = await POST(jsonReq('http://x/api/notes', 'POST', { priority: 'urgent' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_INPUT');
  });
});

describe('/api/notes/[id]', () => {
  it('GETs a note the caller owns', async () => {
    const { note } = await (await create()).json();
    const res = await single.GET(new Request('http://x'), ctx(note.id));
    expect(res.status).toBe(200);
    expect((await res.json()).note.id).toBe(note.id);
  });

  it('404s a note owned by someone else', async () => {
    const { note } = await (await create()).json();
    session.current = { id: userB, username: 'route_b', displayName: 'B' };
    const res = await single.GET(new Request('http://x'), ctx(note.id));
    expect(res.status).toBe(404);
    session.current = { id: userA, username: 'route_a', displayName: 'A' };
  });

  it('PATCH bumps the version when the content changes', async () => {
    const { note } = await (await create()).json();
    const res = await single.PATCH(
      jsonReq('http://x', 'PATCH', { ...body, content: '<p>v2</p>' }),
      ctx(note.id),
    );
    expect((await res.json()).version).toBe(2);
  });

  it('PATCH does not bump when only the description changes', async () => {
    const { note } = await (await create()).json();
    const res = await single.PATCH(
      jsonReq('http://x', 'PATCH', { ...body, desc: 'z' }),
      ctx(note.id),
    );
    expect((await res.json()).version).toBe(1);
  });

  it('DELETE removes it and a second DELETE 404s', async () => {
    const { note } = await (await create()).json();
    expect((await single.DELETE(new Request('http://x'), ctx(note.id))).status).toBe(200);
    expect((await single.DELETE(new Request('http://x'), ctx(note.id))).status).toBe(404);
  });
});

describe('side routes', () => {
  it('toggles favourite', async () => {
    const { note } = await (await create()).json();
    expect(await (await fav.POST(new Request('http://x'), ctx(note.id))).json()).toEqual({
      fav: true,
    });
    expect(await (await fav.POST(new Request('http://x'), ctx(note.id))).json()).toEqual({
      fav: false,
    });
  });

  it('adds and deletes a comment, and rejects an empty one with 400', async () => {
    const { note } = await (await create()).json();
    const ok = await comments.POST(
      jsonReq('http://x', 'POST', { text: 'ghi chú thêm' }),
      ctx(note.id),
    );
    expect(ok.status).toBe(200);
    const created = await ok.json();
    expect(created.comment.author).toEqual({ id: userA, displayName: 'A' });

    const bad = await comments.POST(jsonReq('http://x', 'POST', { text: '' }), ctx(note.id));
    expect(bad.status).toBe(400);

    const del = await comment.DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: note.id, commentId: created.comment.id }),
    });
    expect(del.status).toBe(200);
    expect((await del.json()).note.comments).toHaveLength(0);
  });

  it('saves highlights, returns { ok, contentSha }, and creates no version', async () => {
    const { note } = await (await create()).json();
    const res = await highlights.PUT(
      jsonReq('http://x', 'PUT', { content: '<p><mark data-hl="h1">một</mark></p>' }),
      ctx(note.id),
    );
    const out = await res.json();
    expect(out).toEqual({ ok: true, contentSha: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const after = await (await single.GET(new Request('http://x'), ctx(note.id))).json();
    expect(after.note.versions).toHaveLength(1);
    expect(after.note.versions[0].content).toContain('data-hl="h1"');
    expect(after.note.content).toContain('data-hl="h1"');
  });

  it('restores a version and 400s a non-numeric version', async () => {
    const { note } = await (await create()).json();
    await single.PATCH(jsonReq('http://x', 'PATCH', { ...body, content: '<p>v2</p>' }), ctx(note.id));
    const ok = await restore.POST(new Request('http://x'), {
      params: Promise.resolve({ id: note.id, v: '1' }),
    });
    expect((await ok.json()).version).toBe(3);
    const bad = await restore.POST(new Request('http://x'), {
      params: Promise.resolve({ id: note.id, v: 'abc' }),
    });
    expect(bad.status).toBe(400);
  });

  it('records and lists quizzes', async () => {
    const { note } = await (await create()).json();
    const rec = {
      score: 1,
      total: 1,
      source: 'offline',
      picks: [0],
      questions: [{ q: 'A?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' }],
    };
    const posted = await quizzes.POST(jsonReq('http://x', 'POST', rec), ctx(note.id));
    expect(posted.status).toBe(200);
    const listed = await (await quizzes.GET(new Request('http://x'), ctx(note.id))).json();
    expect(listed.quizzes).toHaveLength(1);
  });

  it('lists tags with counts', async () => {
    const out = await (await tagsRoute.GET()).json();
    expect(out.tags.some((t: { slug: string }) => t.slug === 'tim-mach')).toBe(true);
  });

  it('reads and patches prefs', async () => {
    const got = await (await prefsRoute.GET()).json();
    expect(got.prefs).toMatchObject({ theme: 'light', fontSize: 17, view: 'grid' });
    const patched = await (
      await prefsRoute.PATCH(jsonReq('http://x', 'PATCH', { theme: 'dark', fontSize: 20 }))
    ).json();
    expect(patched.prefs).toMatchObject({ theme: 'dark', fontSize: 20 });
    const bad = await prefsRoute.PATCH(jsonReq('http://x', 'PATCH', { fontSize: 99 }));
    expect(bad.status).toBe(400);
  });
});
