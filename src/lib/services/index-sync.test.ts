// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, noteIndex, tags, closeDb } from '@/lib/db';
import { makeNote } from '@/lib/storage/contract';
import { makeUser, dropUser, useTempStorage } from './helpers';
import {
  computeContentSha,
  derivedIndexValues,
  upsertIndex,
  removeIndex,
  syncTags,
} from './index-sync';

let cleanup: () => Promise<void>;
let uid = '';

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  uid = await makeUser('idx_user');
});
afterAll(async () => {
  await dropUser(uid);
  await cleanup();
  await closeDb();
});

describe('derivedIndexValues', () => {
  it('stores accent-free copies of title and description for search', () => {
    const v = derivedIndexValues(makeNote('n1'));
    expect(v.titleNorm).toBe('phac do dieu tri tang huyet ap');
    expect(v.descriptionNorm).toBe('nguong chan doan va muc tieu.');
  });

  it('stores index-aligned tag slugs and names', () => {
    const v = derivedIndexValues(makeNote('n1'));
    expect(v.tagSlugs).toEqual(['tim-mach', 'phac-do']);
    expect(v.tagNames).toEqual(['Tim mạch', 'Phác đồ']);
  });

  it('takes latestVersion from the last version entry', () => {
    const n = makeNote('n1');
    n.versions = [
      { v: 1, date: n.created, note: 'a', title: 't', content: '' },
      { v: 7, date: n.created, note: 'b', title: 't', content: '' },
    ];
    expect(derivedIndexValues(n).latestVersion).toBe(7);
  });

  it('counts images, comments and quizzes', () => {
    const n = makeNote('n1');
    n.images = [{ id: 'i', label: 'l', src: 's' }];
    n.comments = [{ id: 'c', text: 't', date: n.created }];
    n.quizzes = [
      { id: 'q', date: n.created, score: 1, total: 1, source: 'offline', picks: [0], questions: [] },
    ];
    const v = derivedIndexValues(n);
    expect(v).toMatchObject({ imageCount: 1, commentCount: 1, quizCount: 1 });
  });
});

describe('computeContentSha', () => {
  it('is a 64-character sha256 hex digest', () => {
    expect(computeContentSha(makeNote('n1'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the title, description or tags change', () => {
    const base = computeContentSha(makeNote('n1'));
    expect(computeContentSha(makeNote('n1', { title: 'khác' }))).not.toBe(base);
    expect(computeContentSha(makeNote('n1', { desc: 'khác' }))).not.toBe(base);
    expect(computeContentSha(makeNote('n1', { tags: ['Khác'] }))).not.toBe(base);
  });

  it('changes when the prose text changes', () => {
    const base = computeContentSha(makeNote('n1'));
    expect(computeContentSha(makeNote('n1', { content: '<p>hoàn toàn khác</p>' }))).not.toBe(base);
  });

  it('does NOT change when only highlights are added or removed', () => {
    const plain = makeNote('n1', { content: '<h2>A</h2><p>HA ≥ 140/90 mmHg</p>' });
    const marked = makeNote('n1', {
      content: '<h2>A</h2><p><mark data-hl="h1">HA ≥ 140/90 mmHg</mark></p>',
    });
    expect(computeContentSha(marked)).toBe(computeContentSha(plain));
  });

  it('ignores the note id, version history and quiz history', () => {
    const a = makeNote('n1');
    const b = makeNote('n2');
    b.versions = [];
    expect(computeContentSha(b)).toBe(computeContentSha(a));
  });
});

describe('upsertIndex', () => {
  it('inserts once then updates in place, storing the semantic sha', async () => {
    await upsertIndex(uid, makeNote('n1', { title: 'one' }));
    const second = makeNote('n1', { title: 'two' });
    await upsertIndex(uid, second);
    const rows = await db
      .select()
      .from(noteIndex)
      .where(and(eq(noteIndex.userId, uid), eq(noteIndex.noteId, 'n1')));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('two');
    expect(rows[0].contentSha).toBe(computeContentSha(second));
  });

  it('removeIndex deletes only the given user row', async () => {
    await upsertIndex(uid, makeNote('n-del'));
    await removeIndex(uid, 'n-del');
    const rows = await db
      .select()
      .from(noteIndex)
      .where(and(eq(noteIndex.userId, uid), eq(noteIndex.noteId, 'n-del')));
    expect(rows).toHaveLength(0);
  });
});

describe('syncTags', () => {
  it('inserts new tags and is idempotent on a second call', async () => {
    await syncTags(uid, ['Tim mạch', 'Phác đồ']);
    await syncTags(uid, ['Tim mạch', 'Phác đồ', 'Hô hấp']);
    const rows = await db.select().from(tags).where(eq(tags.userId, uid));
    expect(rows.map((r) => r.slug).sort()).toEqual(['ho-hap', 'phac-do', 'tim-mach']);
  });

  it('treats accent variants of the same tag as one row', async () => {
    await syncTags(uid, ['tim mach']);
    const rows = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, uid), eq(tags.slug, 'tim-mach')));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Tim mạch');
  });

  it('does nothing for an empty tag list', async () => {
    await expect(syncTags(uid, [])).resolves.toBeUndefined();
  });
});
