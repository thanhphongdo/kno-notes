import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  vectorKey,
  staleDocs,
  getVectors,
  putVectors,
  pruneVectors,
  isVectorCachePersistent,
  __resetVectorCache,
} from './vector-cache';
import type { StoredVector } from './vector-cache';
import type { SearchDoc } from './types';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-idb.fixture';

const docs: SearchDoc[] = [
  { noteId: 'n1', title: 'a', desc: '', tags: [], priority: 'high', updated: '2026-01-05T12:00:00.000Z', contentSha: 'sha1', plain: '', highlights: [], imageAlts: []  },
  { noteId: 'n2', title: 'b', desc: '', tags: [], priority: 'medium', updated: '2026-01-06T12:00:00.000Z', contentSha: 'sha2', plain: '', highlights: [], imageAlts: []  },
  { noteId: 'n3', title: 'c', desc: '', tags: [], priority: 'low', updated: '2026-01-07T12:00:00.000Z', contentSha: 'sha3', plain: '', highlights: [], imageAlts: []  },
];

const stored = (noteId: string, contentSha: string): StoredVector => ({
  key: `u1:${noteId}`, userId: 'u1', noteId, contentSha, vector: new Float32Array(3), updatedAt: 0,
});

describe('vectorKey', () => {
  it('scopes the key to the user', () => {
    expect(vectorKey('u1', 'n1')).toBe('u1:n1');
    expect(vectorKey('u2', 'n1')).toBe('u2:n1');
  });
});

describe('staleDocs', () => {
  it('returns documents whose sha changed or that are missing from the cache', () => {
    const cached = new Map([['n1', stored('n1', 'sha1')], ['n2', stored('n2', 'OLD')]]);
    expect(staleDocs(docs, cached).map((d) => d.noteId)).toEqual(['n2', 'n3']);
  });

  it('returns everything for a cold cache', () => {
    expect(staleDocs(docs, new Map()).map((d) => d.noteId)).toEqual(['n1', 'n2', 'n3']);
  });

  it('returns nothing when every sha matches', () => {
    const full = new Map(docs.map((d) => [d.noteId, stored(d.noteId, d.contentSha)]));
    expect(staleDocs(docs, full)).toEqual([]);
  });
});

describe('with IndexedDB available', () => {
  beforeEach(() => { installFakeIndexedDb(); __resetVectorCache(); });
  afterEach(() => { uninstallFakeIndexedDb(); __resetVectorCache(); });

  it('round-trips vectors and reports itself persistent', async () => {
    await putVectors('u1', [{ noteId: 'n1', contentSha: 'sha1', vector: new Float32Array([1, 2, 3]) }]);
    const got = await getVectors('u1', ['n1', 'n2']);
    expect(got.size).toBe(1);
    expect(Array.from(got.get('n1')!.vector)).toEqual([1, 2, 3]);
    expect(got.get('n1')!.contentSha).toBe('sha1');
    expect(isVectorCachePersistent()).toBe(true);
  });

  it('never leaks another user’s vectors', async () => {
    await putVectors('u1', [{ noteId: 'n1', contentSha: 'sha1', vector: new Float32Array([1, 0, 0]) }]);
    await putVectors('u2', [{ noteId: 'n1', contentSha: 'sha9', vector: new Float32Array([9, 9, 9]) }]);
    const u1 = await getVectors('u1', ['n1']);
    expect(u1.get('n1')!.contentSha).toBe('sha1');
  });

  it('overwrites an entry when the sha changes', async () => {
    await putVectors('u1', [{ noteId: 'n1', contentSha: 'old', vector: new Float32Array([1, 0, 0]) }]);
    await putVectors('u1', [{ noteId: 'n1', contentSha: 'new', vector: new Float32Array([0, 1, 0]) }]);
    const got = await getVectors('u1', ['n1']);
    expect(got.size).toBe(1);
    expect(got.get('n1')!.contentSha).toBe('new');
  });

  it('prunes only the current user’s dropped notes', async () => {
    await putVectors('u1', [
      { noteId: 'n1', contentSha: 's1', vector: new Float32Array(3) },
      { noteId: 'n2', contentSha: 's2', vector: new Float32Array(3) },
    ]);
    await putVectors('u2', [{ noteId: 'n2', contentSha: 's2', vector: new Float32Array(3) }]);
    await pruneVectors('u1', ['n1']);
    expect((await getVectors('u1', ['n1', 'n2'])).size).toBe(1);
    expect((await getVectors('u2', ['n2'])).size).toBe(1);
  });

  it('is a no-op for an empty write', async () => {
    await expect(putVectors('u1', [])).resolves.toBeUndefined();
    expect((await getVectors('u1', [])).size).toBe(0);
  });
});

describe('without IndexedDB (private mode)', () => {
  beforeEach(() => { uninstallFakeIndexedDb(); __resetVectorCache(); });
  afterEach(() => { __resetVectorCache(); });

  it('falls back to an in-memory map instead of throwing', async () => {
    await expect(putVectors('u1', [{ noteId: 'n1', contentSha: 'sha1', vector: new Float32Array([1, 2, 3]) }])).resolves.toBeUndefined();
    const got = await getVectors('u1', ['n1']);
    expect(Array.from(got.get('n1')!.vector)).toEqual([1, 2, 3]);
    expect(isVectorCachePersistent()).toBe(false);
  });

  it('still scopes the fallback by user and still prunes', async () => {
    await putVectors('u1', [{ noteId: 'n1', contentSha: 's', vector: new Float32Array(1) }]);
    await putVectors('u2', [{ noteId: 'n1', contentSha: 's', vector: new Float32Array(1) }]);
    await pruneVectors('u1', []);
    expect((await getVectors('u1', ['n1'])).size).toBe(0);
    expect((await getVectors('u2', ['n1'])).size).toBe(1);
  });

  it('survives an IndexedDB implementation that throws on open', async () => {
    installFakeIndexedDb({ failOpen: true });
    __resetVectorCache();
    await expect(putVectors('u1', [{ noteId: 'n1', contentSha: 's', vector: new Float32Array(1) }])).resolves.toBeUndefined();
    await expect(getVectors('u1', ['n1'])).resolves.toBeInstanceOf(Map);
    expect(isVectorCachePersistent()).toBe(false);
    uninstallFakeIndexedDb();
  });
});
