// src/lib/storage/contract.ts
// Bộ test dùng CHUNG cho mọi adapter. Đây là file `.ts` thường (không phải
// `.test.ts`) nên Vitest không thu thập nó hai lần.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Note } from '@/lib/types';
import type { NoteStorage } from './types';

export function makeNote(id: string, over: Partial<Note> = {}): Note {
  const now = '2024-03-07T05:00:00.000Z';
  return {
    id,
    title: 'Phác đồ điều trị tăng huyết áp',
    desc: 'Ngưỡng chẩn đoán và mục tiêu.',
    tags: ['Tim mạch', 'Phác đồ'],
    priority: 'high',
    fav: false,
    created: now,
    updated: now,
    content: '<h2>Ngưỡng chẩn đoán</h2><p>HA ≥ 140/90 mmHg</p>',
    images: [],
    comments: [],
    versions: [{ v: 1, date: now, note: 'Tạo ghi chú', title: 'Phác đồ', content: '<p>x</p>' }],
    quizzes: [],
    ...over,
  };
}

/** A 1x1 transparent PNG, as bytes. */
export const PNG_1PX: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export function runStorageContract(
  name: string,
  make: () => Promise<NoteStorage>,
  teardown: () => Promise<void> = async () => {},
) {
  describe(`NoteStorage contract: ${name}`, () => {
    let s: NoteStorage;
    const A = 'user-aaaaaaaa-1111';
    const B = 'user-bbbbbbbb-2222';

    beforeAll(async () => {
      s = await make();
    });
    afterAll(async () => {
      await teardown();
    });

    it('returns null for a note that was never written', async () => {
      expect(await s.readNote(A, 'missing')).toBeNull();
    });

    it('round-trips a note with Vietnamese content intact', async () => {
      await s.writeNote(A, makeNote('n1'));
      const got = await s.readNote(A, 'n1');
      expect(got).not.toBeNull();
      expect(got!.title).toBe('Phác đồ điều trị tăng huyết áp');
      expect(got!.content).toBe('<h2>Ngưỡng chẩn đoán</h2><p>HA ≥ 140/90 mmHg</p>');
      expect(got!.tags).toEqual(['Tim mạch', 'Phác đồ']);
    });

    it('returns a sha that changes when the content changes', async () => {
      const first = await s.writeNote(A, makeNote('n-sha', { title: 'one' }));
      const second = await s.writeNote(A, makeNote('n-sha', { title: 'two' }));
      expect(first.sha).toBeTruthy();
      expect(second.sha).toBeTruthy();
      expect(second.sha).not.toBe(first.sha);
    });

    it('overwrites an existing note rather than erroring', async () => {
      await s.writeNote(A, makeNote('n2', { title: 'v1' }));
      await s.writeNote(A, makeNote('n2', { title: 'v2' }));
      expect((await s.readNote(A, 'n2'))!.title).toBe('v2');
    });

    it('lists only the calling user note ids', async () => {
      await s.writeNote(B, makeNote('b-only'));
      const idsA = await s.listNoteIds(A);
      const idsB = await s.listNoteIds(B);
      expect(idsA).toContain('n1');
      expect(idsA).not.toContain('b-only');
      expect(idsB).toEqual(['b-only']);
    });

    it('returns an empty list for a user with no notes', async () => {
      expect(await s.listNoteIds('user-cccccccc-3333')).toEqual([]);
    });

    it('cannot read another user note even with the exact id', async () => {
      expect(await s.readNote(B, 'n1')).toBeNull();
      expect(await s.readNote(A, 'b-only')).toBeNull();
    });

    it('deletes a note and makes it unreadable', async () => {
      await s.writeNote(A, makeNote('n-del'));
      await s.deleteNote(A, 'n-del');
      expect(await s.readNote(A, 'n-del')).toBeNull();
    });

    it('treats deleting a missing note as a no-op', async () => {
      await expect(s.deleteNote(A, 'never-existed')).resolves.toBeUndefined();
    });

    it('cannot delete another user note', async () => {
      await s.writeNote(B, makeNote('b-keep'));
      await s.deleteNote(A, 'b-keep');
      expect(await s.readNote(B, 'b-keep')).not.toBeNull();
    });

    it('round-trips image bytes and content type', async () => {
      const { path } = await s.putImage(A, 'img1', PNG_1PX, 'image/png');
      expect(path).toBe('data/users/user-aaaaaaaa-1111/images/img1.png');
      const got = await s.getImage(A, 'img1');
      expect(got).not.toBeNull();
      expect(got!.contentType).toBe('image/png');
      expect(Buffer.compare(got!.data, PNG_1PX)).toBe(0);
    });

    it('returns null for a missing image', async () => {
      expect(await s.getImage(A, 'nope')).toBeNull();
    });

    it('cannot read another user image', async () => {
      await s.putImage(B, 'img-b', PNG_1PX, 'image/png');
      expect(await s.getImage(A, 'img-b')).toBeNull();
    });

    it('rejects a traversing userId before doing any I/O', async () => {
      await expect(s.readNote('../../etc', 'n1')).rejects.toThrow(/userId/);
      await expect(s.listNoteIds('..')).rejects.toThrow(/userId/);
      await expect(s.writeNote('/root', makeNote('x'))).rejects.toThrow(/userId/);
      await expect(s.putImage('a/b', 'i', PNG_1PX, 'image/png')).rejects.toThrow(/userId/);
    });

    it('rejects a traversing noteId and imageId', async () => {
      await expect(s.readNote(A, '../b-only')).rejects.toThrow(/noteId/);
      await expect(s.deleteNote(A, '../../x')).rejects.toThrow(/noteId/);
      await expect(s.getImage(A, '..%2Fimg-b')).rejects.toThrow(/imageId/);
      await expect(s.putImage(A, '../evil', PNG_1PX, 'image/png')).rejects.toThrow(/imageId/);
    });

    it('rejects a disallowed image content type', async () => {
      await expect(s.putImage(A, 'evil', Buffer.from('<svg/>'), 'image/svg+xml')).rejects.toThrow(
        /content type/i,
      );
    });
  });
}
