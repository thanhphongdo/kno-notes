// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Presentation } from '@/lib/types';

// Route nội bộ đi qua cookie phiên; mock ở đây để test chạy không cần đăng nhập.
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

const v1 = await import('./route');
const internal = await import('@/app/api/notes/[id]/presentation/route');
const { __resetRateLimits } = await import('@/lib/api/rate-limit');
const { createApiKey } = await import('@/lib/auth/api-keys');
const { closeDb } = await import('@/lib/db');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { createNote } = await import('@/lib/services/notes');

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';
let keyA = '';
let keyB = '';
let noteId = '';

const base = {
  title: 'Đái tháo đường type 2',
  desc: 'Chẩn đoán',
  tags: ['Nội tiết'],
  priority: 'high' as const,
  content: '<p>x</p>',
  images: [],
};

const pres = (slides = 2): Presentation => ({
  template: 'clinical',
  brandKit: 'clinic',
  slides: Array.from({ length: slides }, (_, i) => ({
    layout: 'section' as const,
    title: `Phần ${i + 1}`,
  })),
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const req = (key: string | null, method = 'GET', payload?: unknown) =>
  new Request('http://x/api/v1/notes/x/presentation', {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

const jsonReq = (method: string, payload?: unknown) =>
  new Request('http://x/api/notes/x/presentation', {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('pres_route_a');
  userB = await makeUser('pres_route_b');
  keyA = (await createApiKey(userA, 'A')).key;
  keyB = (await createApiKey(userB, 'B')).key;
  noteId = (await createNote(userA, base)).note.id;
  session.current = { id: userA, username: 'pres_route_a', displayName: 'A' };
});

afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('/api/v1/notes/{id}/presentation', () => {
  it('401 khi không có bearer token', async () => {
    __resetRateLimits();
    const res = await v1.GET(req(null), ctx(noteId));
    expect(res.status).toBe(401);
  });

  it('trả null khi ghi chú chưa có trình chiếu', async () => {
    __resetRateLimits();
    const res = await v1.GET(req(keyA), ctx(noteId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ presentation: null });
  });

  it('PUT ghi bộ trình chiếu rồi GET đọc lại đúng bộ đó', async () => {
    __resetRateLimits();
    const put = await v1.PUT(req(keyA, 'PUT', { presentation: pres(3) }), ctx(noteId));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, slideCount: 3 });

    __resetRateLimits();
    const got = await v1.GET(req(keyA), ctx(noteId));
    expect((await got.json()).presentation.slides).toHaveLength(3);
  });

  it('PUT null xoá bộ trình chiếu', async () => {
    __resetRateLimits();
    await v1.PUT(req(keyA, 'PUT', { presentation: pres(2) }), ctx(noteId));
    __resetRateLimits();
    const res = await v1.PUT(req(keyA, 'PUT', { presentation: null }), ctx(noteId));
    expect(await res.json()).toEqual({ ok: true, slideCount: 0 });
    __resetRateLimits();
    expect((await (await v1.GET(req(keyA), ctx(noteId))).json()).presentation).toBeNull();
  });

  it('400 khi JSON trình chiếu không hợp lệ', async () => {
    __resetRateLimits();
    const res = await v1.PUT(
      req(keyA, 'PUT', { presentation: { template: 'poster', brandKit: 'mint', slides: [] } }),
      ctx(noteId),
    );
    expect(res.status).toBe(400);
  });

  it('404 với ghi chú của người khác', async () => {
    __resetRateLimits();
    const res = await v1.GET(req(keyB), ctx(noteId));
    expect(res.status).toBe(404);
  });
});

describe('/api/notes/{id}/presentation (phiên đăng nhập)', () => {
  it('GET và PUT chạy cho người đang đăng nhập', async () => {
    const put = await internal.PUT(jsonReq('PUT', { presentation: pres(4) }), ctx(noteId));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, slideCount: 4 });

    const got = await internal.GET(jsonReq('GET'), ctx(noteId));
    expect((await got.json()).presentation.slides).toHaveLength(4);
  });

  it('401 khi chưa đăng nhập', async () => {
    session.current = null;
    const res = await internal.GET(jsonReq('GET'), ctx(noteId));
    expect(res.status).toBe(401);
    session.current = { id: userA, username: 'pres_route_a', displayName: 'A' };
  });
});
