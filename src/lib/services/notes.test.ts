// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { createNote, updateNote, getNote, listNotes } from './notes';
import { listTags } from './tags';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

const base = {
  title: 'Phác đồ tăng huyết áp',
  desc: 'Ngưỡng chẩn đoán',
  tags: ['Tim mạch'],
  priority: 'high' as const,
  content: '<h2>A</h2><p>một</p>',
  images: [],
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('svc_a');
  userB = await makeUser('svc_b');
});

afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('createNote', () => {
  it('creates v1 with the note "Tạo ghi chú"', async () => {
    const { note, version } = await createNote(userA, base);
    expect(version).toBe(1);
    expect(note.versions).toHaveLength(1);
    expect(note.versions[0]).toMatchObject({ v: 1, note: 'Tạo ghi chú', title: base.title });
    expect(note.versions[0].content).toBe(base.content);
  });

  it('honours an explicit change note', async () => {
    const { note } = await createNote(userA, { ...base, changeNote: '  Bản nháp đầu  ' });
    expect(note.versions[0].note).toBe('Bản nháp đầu');
  });

  it('falls back to "Ghi chú không tiêu đề" for an empty title', async () => {
    const { note } = await createNote(userA, { ...base, title: '   ' });
    expect(note.title).toBe('Ghi chú không tiêu đề');
    expect(note.versions[0].title).toBe('Ghi chú không tiêu đề');
  });

  it('starts with fav false and empty comments/quizzes', async () => {
    const { note } = await createNote(userA, base);
    expect(note.fav).toBe(false);
    expect(note.comments).toEqual([]);
    expect(note.quizzes).toEqual([]);
  });

  it('appears in listNotes immediately and registers its tags', async () => {
    const { note } = await createNote(userA, { ...base, tags: ['Hô hấp'] });
    const list = await listNotes(userA, { query: note.title, pageSize: 50 });
    expect(list.notes.some((n) => n.id === note.id)).toBe(true);
    expect((await listTags(userA)).some((t) => t.slug === 'ho-hap')).toBe(true);
  });
});

describe('updateNote version rules', () => {
  it('bumps to v2 when the content changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      content: '<h2>A</h2><p>hai</p>',
    });
    expect(version).toBe(2);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2]);
    expect(after.versions[1].note).toBe('Cập nhật nội dung');
    expect(after.content).toBe('<h2>A</h2><p>hai</p>');
  });

  it('bumps to v2 when only the title changes', async () => {
    const { note } = await createNote(userA, base);
    const { version } = await updateNote(userA, note.id, { ...base, title: 'Tiêu đề mới' });
    expect(version).toBe(2);
  });

  it('does NOT bump when only the description changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      desc: 'khác hẳn',
    });
    expect(version).toBe(1);
    expect(after.versions).toHaveLength(1);
    expect(after.desc).toBe('khác hẳn');
  });

  it('does NOT bump when only the tags change', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      tags: ['Nội khoa'],
    });
    expect(version).toBe(1);
    expect(after.tags).toEqual(['Nội khoa']);
  });

  it('does NOT bump when only the priority changes', async () => {
    const { note } = await createNote(userA, base);
    const { version } = await updateNote(userA, note.id, { ...base, priority: 'low' });
    expect(version).toBe(1);
  });

  it('does NOT bump when only the image list changes', async () => {
    const { note } = await createNote(userA, base);
    const { version, note: after } = await updateNote(userA, note.id, {
      ...base,
      images: [{ id: 'i1', label: 'a', src: `/api/images/${userA}/i1` }],
    });
    expect(version).toBe(1);
    expect(after.images).toHaveLength(1);
  });

  it('does NOT bump on a save with no changes at all', async () => {
    const { note } = await createNote(userA, base);
    expect((await updateNote(userA, note.id, base)).version).toBe(1);
    expect((await updateNote(userA, note.id, base)).version).toBe(1);
  });

  it('keeps counting up across several content edits', async () => {
    const { note } = await createNote(userA, base);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>2</p>' })).version).toBe(2);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>3</p>' })).version).toBe(3);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>3</p>' })).version).toBe(3);
    expect((await updateNote(userA, note.id, { ...base, content: '<p>4</p>' })).version).toBe(4);
    const after = await getNote(userA, note.id);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2, 3, 4]);
  });

  it('honours an explicit change note on update', async () => {
    const { note } = await createNote(userA, base);
    const { note: after } = await updateNote(userA, note.id, {
      ...base,
      content: '<p>x</p>',
      changeNote: 'Rà soát liều',
    });
    expect(after.versions[1].note).toBe('Rà soát liều');
  });

  it('always moves `updated`, even when no version is created', async () => {
    const { note } = await createNote(userA, base);
    await new Promise((r) => setTimeout(r, 5));
    const { note: after } = await updateNote(userA, note.id, { ...base, desc: 'z' });
    expect(after.updated > note.updated).toBe(true);
    expect(after.created).toBe(note.created);
  });

  it('reflects the new latestVersion in the index without a storage read', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>bumped</p>' });
    const list = await listNotes(userA, { query: base.title, pageSize: 50 });
    const row = list.notes.find((n) => n.id === note.id)!;
    expect(row.latestVersion).toBe(2);
  });
});

describe('cross-user isolation', () => {
  it('404s when user B asks for user A note id', async () => {
    const { note } = await createNote(userA, base);
    await expect(getNote(userB, note.id)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when user B tries to update user A note', async () => {
    const { note } = await createNote(userA, base);
    await expect(updateNote(userB, note.id, base)).rejects.toMatchObject({ status: 404 });
  });

  it('never lists another user notes', async () => {
    await createNote(userB, { ...base, title: 'Chỉ của B' });
    const listA = await listNotes(userA, { pageSize: 100 });
    expect(listA.notes.some((n) => n.title === 'Chỉ của B')).toBe(false);
  });

  it('rejects a traversing note id with 404, never a 500', async () => {
    await expect(getNote(userA, '../../etc/passwd')).rejects.toMatchObject({ status: 404 });
  });
});
