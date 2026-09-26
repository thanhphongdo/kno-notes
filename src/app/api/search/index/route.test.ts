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

const { GET } = await import('./route');
const { createNote } = await import('@/lib/services/notes');
const { useTempStorage, makeUser, dropUser } = await import('@/lib/services/helpers');
const { closeDb } = await import('@/lib/db');

let cleanup: () => Promise<void>;
let userA = '';

const base = {
  title: 'Xử trí cấp cứu sốc phản vệ',
  desc: 'Adrenalin tiêm bắp',
  tags: ['Cấp cứu', 'Dị ứng'],
  priority: 'high' as const,
  content: '<p>Adrenalin 0,5 mg tiêm bắp.</p>',
  images: [],
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('sidx_route');
  session.current = { id: userA, username: 'sidx_route', displayName: 'A' };
});
afterAll(async () => {
  await dropUser(userA);
  await cleanup();
  await closeDb();
});

describe('GET /api/search/index', () => {
  it('401s when signed out', async () => {
    const saved = session.current;
    session.current = null;
    expect((await GET()).status).toBe(401);
    session.current = saved;
  });

  it('never lands in a shared cache', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns priority and updated on every item', async () => {
    const { note } = await createNote(userA, base);
    const res = await GET();
    const body = (await res.json()) as {
      userId: string;
      items: { noteId: string; priority: string; updated: string }[];
    };
    expect(body.userId).toBe(userA);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.priority).toMatch(/^(high|medium|low)$/);
      expect(item.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    const mine = body.items.find((i) => i.noteId === note.id)!;
    expect(mine.priority).toBe('high');
  });
});
