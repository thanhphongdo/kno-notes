// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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

const { POST } = await import('./route');
const { GET } = await import('./[userId]/[imageId]/route');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { PNG_1PX } = await import('@/lib/storage/contract');
const { closeDb } = await import('@/lib/db');

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const upload = (bytes = PNG_1PX, type = 'image/png', name = 'a.png') => {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request('http://localhost/api/images', { method: 'POST', body: form }));
};

const fetchImage = (userId: string, imageId: string) =>
  GET(new Request(`http://localhost/api/images/${userId}/${imageId}`), {
    params: Promise.resolve({ userId, imageId }),
  });

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('imgroute_a');
  userB = await makeUser('imgroute_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('POST /api/images', () => {
  it('401s when signed out', async () => {
    session.current = null;
    expect((await upload()).status).toBe(401);
  });

  it('uploads and returns a NoteImage scoped to the session user', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await upload();
    expect(res.status).toBe(200);
    const { image } = await res.json();
    expect(image.src).toBe(`/api/images/${userA}/${image.id}`);
    expect(image.label).toBe('a.png');
  });

  it('413s for a file over 4MB', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(4 * 1024 * 1024)]);
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('IMAGE_TOO_LARGE');
  });

  it('400s for a non-image type', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await upload(PNG_1PX, 'application/pdf', 'a.pdf')).status).toBe(400);
  });

  it('400s when the multipart body has no file field', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const form = new FormData();
    form.append('other', 'x');
    const res = await POST(
      new Request('http://localhost/api/images', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(400);
  });

  it('400s for a JSON body', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await POST(
      new Request('http://localhost/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/images/[userId]/[imageId]', () => {
  let imageId = '';

  beforeAll(async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const { image } = await (await upload()).json();
    imageId = image.id;
  });

  it('serves the bytes with the immutable cache header', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    const res = await fetchImage(userA, imageId);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{40}"$/);
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), PNG_1PX)).toBe(0);
  });

  it('401s when signed out', async () => {
    session.current = null;
    expect((await fetchImage(userA, imageId)).status).toBe(401);
  });

  it('404s when another signed-in user asks for it', async () => {
    session.current = { id: userB, username: 'b', displayName: 'B' };
    const res = await fetchImage(userA, imageId);
    expect(res.status).toBe(404);
  });

  it('404s for an unknown image id', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await fetchImage(userA, 'img-nope')).status).toBe(404);
  });

  it('404s for a traversing image id instead of 500', async () => {
    session.current = { id: userA, username: 'a', displayName: 'A' };
    expect((await fetchImage(userA, '../../etc/passwd')).status).toBe(404);
  });
});
