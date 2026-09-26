import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from '@/lib/search/fake-idb.fixture';
import type { Note, NoteSummary } from '@/lib/types';
import { imageIdFromSrc, queueKey } from './keys';
import {
  cachedVersions, getCachedImage, getCachedNote, listCachedNotes, pruneNotes,
  putImage, putNote, staleNotes, versionOf,
} from './cache';
import { __resetOfflineStore } from './store';
import { clearQueue, enqueue, isNetworkFailure, isRetryableStatus, pendingWrites } from './queue';
import { prefetchNotes, replayQueue } from './sync';

const USER = 'u1';
const OTHER = 'u2';

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    title: `Ghi chú ${id}`,
    desc: '',
    tags: [],
    priority: 'medium',
    fav: false,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    content: '<p>nội dung</p>',
    images: [],
    comments: [],
    versions: [{ v: 1, date: '2026-01-01T00:00:00.000Z', note: 'Tạo ghi chú', title: `Ghi chú ${id}`, content: '<p>nội dung</p>' }],
    quizzes: [],
    ...over,
  };
}

function summary(id: string, latestVersion: number, over: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: `Ghi chú ${id}`,
    desc: '',
    tags: [],
    priority: 'medium',
    fav: false,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    latestVersion,
    imageCount: 0,
    commentCount: 0,
    quizCount: 0,
    ...over,
  };
}

const at = (v: number) =>
  Array.from({ length: v }, (_, i) => ({
    v: i + 1,
    date: '2026-01-01T00:00:00.000Z',
    note: 'x',
    title: 'Ghi chú',
    content: '<p>nội dung</p>',
  }));

beforeEach(() => {
  installFakeIndexedDb();
  __resetOfflineStore();
});

afterEach(() => {
  uninstallFakeIndexedDb();
  __resetOfflineStore();
});

describe('keys', () => {
  it('reads an image id out of its API path', () => {
    expect(imageIdFromSrc('/api/images/u1/imgabc')).toBe('imgabc');
    expect(imageIdFromSrc('/api/images/u1/imgabc?x=1')).toBe('imgabc');
  });

  it('refuses a path that is not one of ours', () => {
    expect(imageIdFromSrc('https://example.com/a.png')).toBeNull();
    expect(imageIdFromSrc('/api/notes/n1')).toBeNull();
  });

  /** Kho trả khoá theo thứ tự chữ cái; thiếu đệm 0 là phát lại sai thứ tự. */
  it('orders queue keys by when they were made, not by string length', () => {
    expect(queueKey(USER, 9) < queueKey(USER, 10)).toBe(true);
    expect(queueKey(USER, 2) < queueKey(USER, 1000)).toBe(true);
  });
});

describe('note cache', () => {
  it('stores a note and reads it back for the same user only', async () => {
    await putNote(USER, note('n1'));
    expect((await getCachedNote(USER, 'n1'))?.title).toBe('Ghi chú n1');
    expect(await getCachedNote(OTHER, 'n1')).toBeNull();
  });

  it('records the note version so staleness needs no second request', async () => {
    await putNote(USER, note('n1', { versions: at(3) }));
    expect(await cachedVersions(USER)).toEqual(new Map([['n1', 3]]));
  });

  it('lists what it has, newest first', async () => {
    await putNote(USER, note('old', { updated: '2026-01-01T00:00:00.000Z' }));
    await putNote(USER, note('new', { updated: '2026-06-01T00:00:00.000Z' }));
    expect((await listCachedNotes(USER)).map((r) => r.noteId)).toEqual(['new', 'old']);
  });

  it('drops notes the user no longer has', async () => {
    await putNote(USER, note('keep'));
    await putNote(USER, note('gone'));
    await pruneNotes(USER, ['keep']);
    expect((await listCachedNotes(USER)).map((r) => r.noteId)).toEqual(['keep']);
  });

  it('never prunes another user out of their own cache', async () => {
    await putNote(USER, note('mine'));
    await putNote(OTHER, note('theirs'));
    await pruneNotes(USER, []);
    expect((await listCachedNotes(OTHER)).map((r) => r.noteId)).toEqual(['theirs']);
  });

  it('keeps image bytes per user', async () => {
    await putImage(USER, 'img1', new Uint8Array([1, 2, 3]).buffer, 'image/png');
    expect((await getCachedImage(USER, 'img1'))?.type).toBe('image/png');
    expect(await getCachedImage(OTHER, 'img1')).toBeNull();
  });
});

describe('staleNotes', () => {
  const cached = new Map([['a', 2], ['b', 5]]);

  it('wants notes it has never seen', () => {
    expect(staleNotes([summary('c', 1)], cached).map((s) => s.id)).toEqual(['c']);
  });

  it('wants notes whose server version moved on', () => {
    expect(staleNotes([summary('a', 3)], cached).map((s) => s.id)).toEqual(['a']);
  });

  it('leaves alone what it already has at the same version', () => {
    expect(staleNotes([summary('a', 2), summary('b', 5)], cached)).toEqual([]);
  });

  /**
   * Bản trong kho MỚI hơn nghĩa là vừa sửa lúc ngoại tuyến và chưa đẩy lên.
   * Tải đè lên là xoá mất công người dùng.
   */
  it('does not overwrite a local copy that is ahead of the server', () => {
    expect(staleNotes([summary('b', 4)], cached)).toEqual([]);
  });

  it('counts versions from the note itself', () => {
    expect(versionOf(note('n1', { versions: at(4) }))).toBe(4);
    expect(versionOf(note('n1', { versions: [] }))).toBe(1);
  });
});

describe('queue', () => {
  const write = (label: string) => ({
    kind: 'note.favorite' as const,
    path: '/api/notes/n1/favorite',
    method: 'POST' as const,
    body: { fav: true },
    label,
    noteId: 'n1',
  });

  it('keeps the order the actions were taken in', async () => {
    await enqueue(USER, write('một'));
    await enqueue(USER, write('hai'));
    await enqueue(USER, write('ba'));
    expect((await pendingWrites(USER)).map((w) => w.label)).toEqual(['một', 'hai', 'ba']);
  });

  it('does not let two actions in the same millisecond overwrite each other', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      await enqueue(USER, write('một'));
      await enqueue(USER, write('hai'));
      expect(await pendingWrites(USER)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('scopes the queue to one user', async () => {
    await enqueue(USER, write('mine'));
    await enqueue(OTHER, write('theirs'));
    expect((await pendingWrites(USER)).map((w) => w.label)).toEqual(['mine']);
    await clearQueue(USER);
    expect((await pendingWrites(OTHER)).map((w) => w.label)).toEqual(['theirs']);
  });

  it('tells a lost connection apart from a refusal', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('404'))).toBe(false);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
  });
});

// ── sync ────────────────────────────────────────────────────────────────────

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => new ArrayBuffer(8), headers: new Headers({ 'Content-Type': 'image/png' }) }) as unknown as Response;
const status = (code: number) =>
  ({ ok: false, status: code, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: new Headers() }) as unknown as Response;

function listResponse(notes: NoteSummary[], pages = 1) {
  return { notes, total: notes.length, page: 1, pages, pageSize: 100 };
}

describe('prefetchNotes', () => {
  it('downloads every note it does not already have', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1), summary('n2', 1)]));
      return ok({ note: note(url.endsWith('n1') ? 'n1' : 'n2') });
    }) as unknown as typeof fetch;

    const result = await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect(result).toMatchObject({ notes: 2, total: 2, interrupted: false });
    expect((await listCachedNotes(USER)).map((r) => r.noteId).sort()).toEqual(['n1', 'n2']);
  });

  it('asks only for what changed on a second run', async () => {
    await putNote(USER, note('n1'));
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1)]));
      return ok({ note: note('n1') });
    }) as unknown as typeof fetch;

    const result = await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect(result.notes).toBe(0);
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('re-downloads a note whose version moved on', async () => {
    await putNote(USER, note('n1'));
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 2)]));
      return ok({ note: note('n1', { title: 'Đã sửa', versions: at(2) }) });
    }) as unknown as typeof fetch;

    await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect((await getCachedNote(USER, 'n1'))?.title).toBe('Đã sửa');
  });

  it('stores the images a note points at', async () => {
    const withImage = note('n1', {
      images: [{ id: 'img1', label: 'Sơ đồ', src: `/api/images/${USER}/img1` }],
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1)]));
      if (url.startsWith('/api/images/')) return ok(null);
      return ok({ note: withImage });
    }) as unknown as typeof fetch;

    const result = await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect(result.images).toBe(1);
    expect(await getCachedImage(USER, 'img1')).not.toBeNull();
  });

  it('stops where the connection died and says so, keeping what it got', async () => {
    let calls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1), summary('n2', 1)]));
      calls += 1;
      if (calls > 1) throw new TypeError('Failed to fetch');
      return ok({ note: note('n1') });
    }) as unknown as typeof fetch;

    const result = await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect(result).toMatchObject({ notes: 1, interrupted: true });
    expect((await listCachedNotes(USER)).map((r) => r.noteId)).toEqual(['n1']);
  });

  it('skips a note the server no longer has instead of giving up', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1), summary('n2', 1)]));
      if (url.endsWith('n1')) return status(404);
      return ok({ note: note('n2') });
    }) as unknown as typeof fetch;

    const result = await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect(result.notes).toBe(1);
    expect(result.interrupted).toBe(false);
  });

  it('forgets notes that were deleted elsewhere', async () => {
    await putNote(USER, note('gone'));
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/notes?')) return ok(listResponse([summary('n1', 1)]));
      return ok({ note: note('n1') });
    }) as unknown as typeof fetch;

    await prefetchNotes(USER, fetcher, { paceMs: 0 });
    expect((await listCachedNotes(USER)).map((r) => r.noteId)).toEqual(['n1']);
  });
});

describe('replayQueue', () => {
  const fav = { kind: 'note.favorite' as const, path: '/api/notes/n1/favorite', method: 'POST' as const, body: {}, label: 'Yêu thích', noteId: 'n1' };

  it('sends what is waiting and empties the queue', async () => {
    await enqueue(USER, fav);
    await enqueue(USER, { ...fav, label: 'Bình luận', path: '/api/notes/n1/comments' });
    const fetcher = vi.fn(async () => ok({})) as unknown as typeof fetch;

    expect(await replayQueue(USER, fetcher)).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    expect(await pendingWrites(USER)).toEqual([]);
  });

  it('sends them in the order they were made', async () => {
    await enqueue(USER, { ...fav, label: 'một', path: '/a' });
    await enqueue(USER, { ...fav, label: 'hai', path: '/b' });
    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string) => { seen.push(url); return ok({}); }) as unknown as typeof fetch;

    await replayQueue(USER, fetcher);
    expect(seen).toEqual(['/a', '/b']);
  });

  it('stops at the first lost connection and keeps the rest for later', async () => {
    await enqueue(USER, { ...fav, label: 'một', path: '/a' });
    await enqueue(USER, { ...fav, label: 'hai', path: '/b' });
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/b') throw new TypeError('Failed to fetch');
      return ok({});
    }) as unknown as typeof fetch;

    expect(await replayQueue(USER, fetcher)).toEqual({ sent: 1, rejected: 0, remaining: 1 });
    expect((await pendingWrites(USER)).map((w) => w.label)).toEqual(['hai']);
  });

  it('waits out a server that is temporarily broken', async () => {
    await enqueue(USER, fav);
    const fetcher = vi.fn(async () => status(503)) as unknown as typeof fetch;

    expect(await replayQueue(USER, fetcher)).toEqual({ sent: 0, rejected: 0, remaining: 1 });
    expect(await pendingWrites(USER)).toHaveLength(1);
  });

  /** Giữ lại một mục máy chủ đã từ chối hẳn là kẹt vĩnh viễn mọi mục sau nó. */
  it('drops an action the server refuses outright, and carries on', async () => {
    await enqueue(USER, { ...fav, label: 'hỏng', path: '/a' });
    await enqueue(USER, { ...fav, label: 'tốt', path: '/b' });
    const fetcher = vi.fn(async (url: string) => (url === '/a' ? status(404) : ok({}))) as unknown as typeof fetch;

    expect(await replayQueue(USER, fetcher)).toEqual({ sent: 1, rejected: 1, remaining: 0 });
    expect(await pendingWrites(USER)).toEqual([]);
  });

  it('does nothing, cheerfully, with an empty queue', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await replayQueue(USER, fetcher)).toEqual({ sent: 0, rejected: 0, remaining: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
