// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, noteIndex, closeDb } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { useTempStorage, makeUser, dropUser } from './helpers';
import {
  createNote,
  updateNote,
  getNote,
  listNotes,
  restoreVersion,
  deleteNote,
  toggleFavorite,
  addComment,
  deleteComment,
  saveHighlights,
  addQuizRecord,
} from './notes';

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

const indexRow = async (userId: string, noteId: string) => {
  const [r] = await db
    .select()
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), eq(noteIndex.noteId, noteId)));
  return r;
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('mut_a');
  userB = await makeUser('mut_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('restoreVersion', () => {
  it('appends a new version noted "Khôi phục từ vN" rather than rewinding', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>v3</p>' });

    const { note: after, version } = await restoreVersion(userA, note.id, 1);
    expect(version).toBe(4);
    expect(after.versions.map((v) => v.v)).toEqual([1, 2, 3, 4]);
    expect(after.versions[3].note).toBe('Khôi phục từ v1');
  });

  it('sets the live content to the restored version content', async () => {
    const { note } = await createNote(userA, { ...base, content: '<p>original</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>changed</p>' });
    const { note: after } = await restoreVersion(userA, note.id, 1);
    expect(after.content).toBe('<p>original</p>');
    expect(after.versions[2].content).toBe('<p>original</p>');
  });

  it('keeps the current title on the restore version', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, title: 'Tiêu đề v2', content: '<p>v2</p>' });
    const { note: after } = await restoreVersion(userA, note.id, 1);
    expect(after.title).toBe('Tiêu đề v2');
    expect(after.versions.at(-1)!.title).toBe('Tiêu đề v2');
  });

  it('can restore the same version twice, producing two new versions', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    expect((await restoreVersion(userA, note.id, 1)).version).toBe(3);
    expect((await restoreVersion(userA, note.id, 1)).version).toBe(4);
    const after = await getNote(userA, note.id);
    expect(after.versions.map((v) => v.note).slice(-2)).toEqual([
      'Khôi phục từ v1',
      'Khôi phục từ v1',
    ]);
  });

  it('moves `updated` and the index latestVersion', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await restoreVersion(userA, note.id, 1);
    expect((await indexRow(userA, note.id)).latestVersion).toBe(3);
  });

  it('404s for a version number that does not exist', async () => {
    const { note } = await createNote(userA, base);
    await expect(restoreVersion(userA, note.id, 99)).rejects.toMatchObject({ status: 404 });
    await expect(restoreVersion(userA, note.id, 0)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when another user tries to restore', async () => {
    const { note } = await createNote(userA, base);
    await expect(restoreVersion(userB, note.id, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteNote', () => {
  it('removes both the stored file and the index row', async () => {
    const { note } = await createNote(userA, base);
    await deleteNote(userA, note.id);
    expect(await getStorage().readNote(userA, note.id)).toBeNull();
    expect(await indexRow(userA, note.id)).toBeUndefined();
    await expect(getNote(userA, note.id)).rejects.toMatchObject({ status: 404 });
  });

  it('404s when another user tries to delete, leaving the note intact', async () => {
    const { note } = await createNote(userA, base);
    await expect(deleteNote(userB, note.id)).rejects.toMatchObject({ status: 404 });
    expect(await getStorage().readNote(userA, note.id)).not.toBeNull();
  });

  it('404s for a note that is already gone', async () => {
    const { note } = await createNote(userA, base);
    await deleteNote(userA, note.id);
    await expect(deleteNote(userA, note.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('toggleFavorite', () => {
  it('flips the flag and mirrors it into the index', async () => {
    const { note } = await createNote(userA, base);
    expect(await toggleFavorite(userA, note.id)).toEqual({ fav: true });
    expect((await indexRow(userA, note.id)).favorite).toBe(true);
    expect(await toggleFavorite(userA, note.id)).toEqual({ fav: false });
    expect((await indexRow(userA, note.id)).favorite).toBe(false);
  });

  it('makes the note appear under nav=fav straight away', async () => {
    const { note } = await createNote(userA, { ...base, title: 'Sẽ yêu thích' });
    await toggleFavorite(userA, note.id);
    const list = await listNotes(userA, { nav: 'fav', pageSize: 100 });
    expect(list.notes.some((n) => n.id === note.id)).toBe(true);
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    await toggleFavorite(userA, note.id);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(toggleFavorite(userB, note.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('comments', () => {
  const asA = () => ({ id: userA, username: 'mut_a', displayName: 'Bác sĩ' });

  it('appends a comment with an id and ISO date, and bumps commentCount', async () => {
    const { note } = await createNote(userA, base);
    const { comment, note: after } = await addComment(
      asA(),
      note.id,
      '  Lưu ý người cao tuổi.  ',
    );
    expect(comment.text).toBe('Lưu ý người cao tuổi.');
    expect(comment.id).toBeTruthy();
    expect(comment.author).toEqual({ id: userA, displayName: 'Bác sĩ' });
    expect(new Date(comment.date).toISOString()).toBe(comment.date);
    expect(after.comments).toHaveLength(1);
    expect((await indexRow(userA, note.id)).commentCount).toBe(1);
  });

  it('appends in order, newest last (prototype pushes to the end)', async () => {
    const { note } = await createNote(userA, base);
    await addComment(asA(), note.id, 'một');
    const { note: after } = await addComment(asA(), note.id, 'hai');
    expect(after.comments.map((c) => c.text)).toEqual(['một', 'hai']);
  });

  it('rejects an empty or whitespace-only comment with 400', async () => {
    const { note } = await createNote(userA, base);
    await expect(addComment(asA(), note.id, '   ')).rejects.toMatchObject({ status: 400 });
    await expect(addComment(asA(), note.id, '')).rejects.toMatchObject({ status: 400 });
  });

  it('deletes a comment by id and decrements the count', async () => {
    const { note } = await createNote(userA, base);
    const { comment } = await addComment(asA(), note.id, 'sẽ xoá');
    const { note: after } = await deleteComment(userA, note.id, comment.id);
    expect(after.comments).toHaveLength(0);
    expect((await indexRow(userA, note.id)).commentCount).toBe(0);
  });

  it('404s when deleting a comment id that is not on this note', async () => {
    const { note } = await createNote(userA, base);
    await expect(deleteComment(userA, note.id, 'c-nope')).rejects.toMatchObject({ status: 404 });
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    const { comment } = await addComment(asA(), note.id, 'x');
    await deleteComment(userA, note.id, comment.id);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(
      addComment({ id: userB, username: 'mut_b', displayName: 'B' }, note.id, 'x'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('saveHighlights', () => {
  const marked = '<h2>A</h2><p><mark data-hl="h1">một</mark></p>';

  it('updates content AND the last version content, creating no new version', async () => {
    const { note } = await createNote(userA, base);
    const { note: after, ok, contentSha } = await saveHighlights(userA, note.id, marked);
    expect(ok).toBe(true);
    expect(contentSha).toMatch(/^[0-9a-f]{64}$/);
    expect(after.content).toBe(marked);
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0].content).toBe(marked);
    expect(after.versions[0].note).toBe('Tạo ghi chú');
  });

  it('touches only the LAST version when several exist', async () => {
    const { note } = await createNote(userA, { ...base, content: '<p>v1</p>' });
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    const { note: after } = await saveHighlights(
      userA,
      note.id,
      '<p><mark data-hl="h9">v2</mark></p>',
    );
    expect(after.versions).toHaveLength(2);
    expect(after.versions[0].content).toBe('<p>v1</p>');
    expect(after.versions[1].content).toBe('<p><mark data-hl="h9">v2</mark></p>');
  });

  it('leaves latestVersion unchanged in the index', async () => {
    const { note } = await createNote(userA, base);
    await updateNote(userA, note.id, { ...base, content: '<p>v2</p>' });
    await saveHighlights(userA, note.id, marked);
    expect((await indexRow(userA, note.id)).latestVersion).toBe(2);
  });

  it('removing a highlight is just another save', async () => {
    const { note } = await createNote(userA, base);
    await saveHighlights(userA, note.id, marked);
    const { note: after } = await saveHighlights(userA, note.id, '<h2>A</h2><p>một</p>');
    expect(after.content).toBe('<h2>A</h2><p>một</p>');
    expect(after.versions).toHaveLength(1);
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(saveHighlights(userB, note.id, marked)).rejects.toMatchObject({ status: 404 });
  });
});

describe('addQuizRecord', () => {
  const rec = {
    score: 1,
    total: 1,
    source: 'offline' as const,
    picks: [0],
    questions: [{ q: 'Mục tiêu HA?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: 'vì vậy' }],
  };

  it('prepends the newest record and bumps quizCount', async () => {
    const { note } = await createNote(userA, base);
    const first = await addQuizRecord(userA, note.id, rec);
    const second = await addQuizRecord(userA, note.id, { ...rec, score: 0, picks: [1] });
    expect(second.note.quizzes.map((q) => q.score)).toEqual([0, 1]);
    expect(second.note.quizzes[1].id).toBe(first.quiz.id);
    expect((await indexRow(userA, note.id)).quizCount).toBe(2);
  });

  it('assigns an id and ISO date when none is supplied', async () => {
    const { note } = await createNote(userA, base);
    const { quiz } = await addQuizRecord(userA, note.id, rec);
    expect(quiz.id).toMatch(/^q/);
    expect(new Date(quiz.date).toISOString()).toBe(quiz.date);
  });

  it('does NOT create a version', async () => {
    const { note } = await createNote(userA, base);
    await addQuizRecord(userA, note.id, rec);
    expect((await getNote(userA, note.id)).versions).toHaveLength(1);
  });

  it('rejects a record whose picks length does not match its questions', async () => {
    const { note } = await createNote(userA, base);
    await expect(
      addQuizRecord(userA, note.id, { ...rec, picks: [0, 1] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s for another user', async () => {
    const { note } = await createNote(userA, base);
    await expect(addQuizRecord(userB, note.id, rec)).rejects.toMatchObject({ status: 404 });
  });
});
