// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { computeContentSha } from './index-sync';
import { createNote, saveHighlights, updateNote, getNote } from './notes';
import { buildSearchDocs, PLAIN_MAX } from './search-index';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const base = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch', 'Phác đồ'],
  priority: 'high' as const,
  content: '<h2>Ngưỡng</h2><p>HA phòng khám ≥ 140/90 mmHg.</p><ul><li>Holter ≥ 130/80</li></ul>',
  images: [],
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('sidx_a');
  userB = await makeUser('sidx_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('buildSearchDocs', () => {
  it('returns [] for a user with no notes', async () => {
    expect(await buildSearchDocs(userB)).toEqual([]);
  });

  it('emits exactly the nine contract fields per note', async () => {
    const { note } = await createNote(userA, base);
    const docs = await buildSearchDocs(userA);
    const doc = docs.find((d) => d.noteId === note.id)!;
    expect(Object.keys(doc).sort()).toEqual(
      ['contentSha', 'desc', 'highlights', 'noteId', 'plain', 'priority', 'tags', 'title', 'updated'].sort(),
    );
    expect(doc.title).toBe(base.title);
    expect(doc.desc).toBe(base.desc);
    expect(doc.tags).toEqual(['Tim mạch', 'Phác đồ']);
  });

  it('carries the priority and the updated timestamp the suggestion row needs', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    const stored = await getNote(userA, note.id);
    expect(doc.priority).toBe('high');
    expect(doc.updated).toBe(stored.updated);
    expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('tracks a priority change on the next build', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, priority: 'low' });
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.priority).toBe('low');
  });

  it('strips HTML into readable plain text', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.plain).toBe('Ngưỡng HA phòng khám ≥ 140/90 mmHg. Holter ≥ 130/80');
    expect(doc.plain).not.toContain('<');
  });

  it('matches the contentSha the note index stores', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.contentSha).toBe(computeContentSha(await getNote(userA, note.id)));
    expect(doc.contentSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes contentSha when the title changes', async () => {
    const { note } = await createNote(userA, base);
    const before = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    await updateNote(userA, note.id, { ...base, title: 'Tiêu đề hoàn toàn mới' });
    const after = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(after.title).toBe('Tiêu đề hoàn toàn mới');
    expect(after.contentSha).not.toBe(before.contentSha);
  });

  it('does NOT change contentSha or plain when a highlight is added', async () => {
    const { note } = await createNote(userA, base);
    const before = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    await saveHighlights(
      userA,
      note.id,
      '<h2>Ngưỡng</h2><p><mark data-hl="h1">HA phòng khám ≥ 140/90 mmHg.</mark></p><ul><li>Holter ≥ 130/80</li></ul>',
    );
    const after = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(after.plain).toBe(before.plain);
    expect(after.contentSha).toBe(before.contentSha);
    // ...but the passage itself must reach the browser, or it cannot be found.
    expect(after.highlights).toEqual(['HA phòng khám ≥ 140/90 mmHg.']);
  });

  it('ships an empty highlight list for a note with nothing marked', async () => {
    const { note } = await createNote(userA, base);
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.highlights).toEqual([]);
  });

  it(`truncates plain to ${PLAIN_MAX} characters`, async () => {
    const long = '<p>' + 'x'.repeat(6000) + '</p>';
    const { note } = await createNote(userA, { ...base, content: long });
    const doc = (await buildSearchDocs(userA)).find((d) => d.noteId === note.id)!;
    expect(doc.plain).toHaveLength(PLAIN_MAX);
  });

  it('never includes another user notes', async () => {
    await createNote(userB, { ...base, title: 'Chỉ của B' });
    const docs = await buildSearchDocs(userA);
    expect(docs.some((d) => d.title === 'Chỉ của B')).toBe(false);
  });

  it('drops a note whose stored file has gone missing rather than throwing', async () => {
    const { note } = await createNote(userA, base);
    const { getStorage } = await import('@/lib/storage');
    await getStorage().deleteNote(userA, note.id); // index row left behind on purpose
    const docs = await buildSearchDocs(userA);
    expect(docs.some((d) => d.noteId === note.id)).toBe(false);
  });
});
