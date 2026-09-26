// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { __resetRateLimits } from '@/lib/api/rate-limit';
import { createApiKey } from '@/lib/auth/api-keys';
import { closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from '@/lib/services/helpers';
import { GET, POST } from './route';
import * as single from './[id]/route';
import * as v1comments from './[id]/comments/route';
import * as v1tags from '../tags/route';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';
let keyA = '';
let keyB = '';

const body = {
  title: 'Ghi chú từ AI',
  desc: 'Mô tả',
  tags: ['Tim mạch'],
  priority: 'high',
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

const req = (url: string, key: string | null, method = 'GET', payload?: unknown) =>
  new Request(url, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('v1_a');
  userB = await makeUser('v1_b');
  keyA = (await createApiKey(userA, 'A')).key;
  keyB = (await createApiKey(userB, 'B')).key;
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('bearer auth', () => {
  it('401s with no Authorization header', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', null));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('401s for a non-Bearer scheme', async () => {
    __resetRateLimits();
    const res = await GET(
      new Request('http://x/api/v1/notes', { headers: { authorization: `Basic ${keyA}` } }),
    );
    expect(res.status).toBe(401);
  });

  it('401s for an unknown key with the shared error envelope', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', 'kn_' + '0'.repeat(32)));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key không hợp lệ.' },
    });
  });

  it('accepts a valid key', async () => {
    __resetRateLimits();
    const res = await GET(req('http://x/api/v1/notes', keyA));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('pageSize', 6);
  });
});

describe('rate limiting', () => {
  it('429s after 60 requests in a minute, with a retry hint', async () => {
    __resetRateLimits();
    for (let i = 0; i < 60; i++) {
      expect((await GET(req('http://x/api/v1/notes', keyA))).status).toBe(200);
    }
    const res = await GET(req('http://x/api/v1/notes', keyA));
    expect(res.status).toBe(429);
    const out = await res.json();
    expect(out.error.code).toBe('RATE_LIMITED');
    expect(out.error.message).toMatch(/Thử lại sau \d+ giây\./);
  });

  it('limits each key independently', async () => {
    __resetRateLimits();
    for (let i = 0; i < 60; i++) await GET(req('http://x/api/v1/notes', keyA));
    expect((await GET(req('http://x/api/v1/notes', keyA))).status).toBe(429);
    expect((await GET(req('http://x/api/v1/notes', keyB))).status).toBe(200);
  });
});

describe('CRUD and scoping', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('creates, reads, updates and deletes a note', async () => {
    __resetRateLimits();
    const created = await (await POST(req('http://x/api/v1/notes', keyA, 'POST', body))).json();
    expect(created.version).toBe(1);

    const got = await (await single.GET(req('http://x', keyA), ctx(created.note.id))).json();
    expect(got.note.title).toBe(body.title);

    const patched = await (
      await single.PATCH(
        req('http://x', keyA, 'PATCH', { ...body, content: '<p>v2</p>' }),
        ctx(created.note.id),
      )
    ).json();
    expect(patched.version).toBe(2);

    expect(
      (await single.DELETE(req('http://x', keyA, 'DELETE'), ctx(created.note.id))).status,
    ).toBe(200);
    expect((await single.GET(req('http://x', keyA), ctx(created.note.id))).status).toBe(404);
  });

  it('never lets key B touch a note owned by A', async () => {
    __resetRateLimits();
    const created = await (await POST(req('http://x/api/v1/notes', keyA, 'POST', body))).json();
    expect((await single.GET(req('http://x', keyB), ctx(created.note.id))).status).toBe(404);
    expect(
      (await single.PATCH(req('http://x', keyB, 'PATCH', body), ctx(created.note.id))).status,
    ).toBe(404);
    expect(
      (await single.DELETE(req('http://x', keyB, 'DELETE'), ctx(created.note.id))).status,
    ).toBe(404);
    expect((await single.GET(req('http://x', keyA), ctx(created.note.id))).status).toBe(200);
  });

  it('adds a comment carrying the key owner as author', async () => {
    __resetRateLimits();
    const created = await (await POST(req('http://x/api/v1/notes', keyA, 'POST', body))).json();
    const res = await v1comments.POST(
      req('http://x', keyA, 'POST', { text: 'từ agent' }),
      ctx(created.note.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).comment.author.id).toBe(userA);
  });

  it('lists tags for the key owner only', async () => {
    __resetRateLimits();
    const out = await (await v1tags.GET(req('http://x/api/v1/tags', keyA))).json();
    expect(out.tags.some((t: { slug: string }) => t.slug === 'tim-mach')).toBe(true);
  });

  it('400s on an invalid body with the shared envelope', async () => {
    __resetRateLimits();
    const res = await POST(req('http://x/api/v1/notes', keyA, 'POST', { priority: 'urgent' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toHaveProperty('code', 'INVALID_INPUT');
  });
});
