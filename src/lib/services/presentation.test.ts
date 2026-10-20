// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db, noteIndex } from '@/lib/db';
import { makeNote } from '@/lib/storage/contract';
import type { Presentation } from '@/lib/types';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { derivedIndexValues, rowToSummary } from './index-sync';
import { createNote, getNote, listNotes, setPresentation, updateNote } from './notes';

let cleanup: () => Promise<void>;
let userA = '';

const base = {
  title: 'Đái tháo đường type 2',
  desc: 'Chẩn đoán và điều trị',
  tags: ['Nội tiết'],
  priority: 'high' as const,
  content: '<h2>Chẩn đoán</h2><p>HbA1c ≥ 6.5%</p>',
  images: [],
};

const pres = (slides = 2): Presentation => ({
  template: 'deck',
  brandKit: 'mint',
  slides: Array.from({ length: slides }, (_, i) => ({
    layout: 'section' as const,
    title: `Phần ${i + 1}`,
  })),
});

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('pres_a');
});

afterAll(async () => {
  await dropUser(userA);
  await cleanup();
  await closeDb();
});

const indexRow = (noteId: string) =>
  db
    .select()
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userA), eq(noteIndex.noteId, noteId)))
    .limit(1)
    .then((rows) => rows[0]);

describe('derivedIndexValues — slideCount', () => {
  it('đếm số slide của bộ trình chiếu', () => {
    expect(derivedIndexValues(makeNote('n1', { presentation: pres(3) })).slideCount).toBe(3);
  });

  it('cho 0 khi ghi chú không có trình chiếu', () => {
    expect(derivedIndexValues(makeNote('n1')).slideCount).toBe(0);
    expect(derivedIndexValues(makeNote('n1', { presentation: null })).slideCount).toBe(0);
  });
});

describe('rowToSummary', () => {
  it('mang slideCount xuống bản tóm tắt', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(4) });
    const row = await indexRow(note.id);
    expect(rowToSummary(row).slideCount).toBe(4);
  });
});

describe('createNote', () => {
  it('lưu bộ trình chiếu được gửi kèm', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(2) });
    expect(note.presentation?.slides).toHaveLength(2);
    expect((await getNote(userA, note.id)).presentation?.template).toBe('deck');
  });

  it('không có trình chiếu khi không gửi', async () => {
    const { note } = await createNote(userA, base);
    expect(note.presentation ?? null).toBeNull();
    expect((await indexRow(note.id)).slideCount).toBe(0);
  });
});

describe('updateNote', () => {
  it('GIỮ NGUYÊN bộ trình chiếu khi không truyền trường đó', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(3) });
    const { note: after } = await updateNote(userA, note.id, {
      ...base,
      title: 'Tiêu đề mới',
      content: '<p>khác</p>',
    });
    expect(after.presentation?.slides).toHaveLength(3);
    expect((await getNote(userA, note.id)).presentation?.slides).toHaveLength(3);
    expect((await indexRow(note.id)).slideCount).toBe(3);
  });

  it('xoá bộ trình chiếu khi truyền null', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(3) });
    const { note: after } = await updateNote(userA, note.id, { ...base, presentation: null });
    expect(after.presentation).toBeNull();
    expect((await indexRow(note.id)).slideCount).toBe(0);
  });

  it('thay bộ trình chiếu khi truyền bộ mới', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(3) });
    await updateNote(userA, note.id, { ...base, presentation: pres(1) });
    expect((await getNote(userA, note.id)).presentation?.slides).toHaveLength(1);
  });
});

describe('setPresentation', () => {
  it('ghi đè bộ trình chiếu và KHÔNG tạo phiên bản mới', async () => {
    const { note } = await createNote(userA, base);
    const before = note.versions.length;
    const { note: after, slideCount } = await setPresentation(userA, note.id, pres(5));
    expect(slideCount).toBe(5);
    expect(after.versions).toHaveLength(before);
    expect(after.presentation?.slides).toHaveLength(5);
    expect((await getNote(userA, note.id)).versions).toHaveLength(before);
  });

  it('giữ nguyên nội dung, bộ câu hỏi và lịch sử trắc nghiệm', async () => {
    const questions = [
      { q: 'HbA1c ngưỡng?', options: ['5', '6.5', '7', '8'], answer: 1, explain: 'ADA' },
    ];
    const { note } = await createNote(userA, { ...base, questions });
    const { note: after } = await setPresentation(userA, note.id, pres(2));
    expect(after.content).toBe(base.content);
    expect(after.questions).toEqual(questions);
  });

  it('xoá bộ trình chiếu khi truyền null', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(2) });
    const { slideCount } = await setPresentation(userA, note.id, null);
    expect(slideCount).toBe(0);
    expect((await getNote(userA, note.id)).presentation).toBeNull();
  });

  it('cập nhật slide_count trong note_index', async () => {
    const { note } = await createNote(userA, base);
    await setPresentation(userA, note.id, pres(6));
    expect((await indexRow(note.id)).slideCount).toBe(6);
    await setPresentation(userA, note.id, null);
    expect((await indexRow(note.id)).slideCount).toBe(0);
  });

  it('404 với ghi chú của người khác', async () => {
    const userB = await makeUser('pres_b');
    const { note } = await createNote(userB, base);
    await expect(setPresentation(userA, note.id, pres(1))).rejects.toMatchObject({ status: 404 });
    await dropUser(userB);
  });
});

describe('listNotes', () => {
  it('trả slideCount để danh sách biết bài nào có trình chiếu', async () => {
    const { note } = await createNote(userA, { ...base, presentation: pres(7) });
    const { notes } = await listNotes(userA, { pageSize: 100 });
    expect(notes.find((n) => n.id === note.id)?.slideCount).toBe(7);
  });
});

describe('icon, hoa văn và chuyển động đi qua tầng lưu trữ', () => {
  const rich: Presentation = {
    template: 'clinical',
    brandKit: 'midnight',
    pattern: 'ecg-baseline',
    motion: 'subtle',
    slides: [
      { layout: 'title', title: 'Viêm phổi cộng đồng', icon: 'lungs' },
      {
        layout: 'bullets',
        title: 'Dấu hiệu nặng',
        icon: 'alert',
        bullets: ['Nhịp thở ≥ 30', { text: 'SpO2 < 92%', icon: 'scan' }],
      },
    ],
  };

  it('createNote rồi getNote trả về đúng từng trường', async () => {
    const { note } = await createNote(userA, { ...base, presentation: rich });
    expect((await getNote(userA, note.id)).presentation).toEqual(rich);
  });

  it('setPresentation rồi getNote trả về đúng từng trường', async () => {
    const { note } = await createNote(userA, base);
    await setPresentation(userA, note.id, rich);
    expect((await getNote(userA, note.id)).presentation).toEqual(rich);
    expect((await indexRow(note.id)).slideCount).toBe(2);
  });

  it('updateNote không truyền presentation thì icon/pattern/motion còn nguyên', async () => {
    const { note } = await createNote(userA, { ...base, presentation: rich });
    await updateNote(userA, note.id, { ...base, content: '<p>sửa</p>' });
    expect((await getNote(userA, note.id)).presentation).toEqual(rich);
  });

  it('updateNote truyền null vẫn xoá sạch', async () => {
    const { note } = await createNote(userA, { ...base, presentation: rich });
    await updateNote(userA, note.id, { ...base, presentation: null });
    expect((await getNote(userA, note.id)).presentation).toBeNull();
  });

  it('bộ slide cũ (bullet toàn chuỗi, không pattern/motion) vẫn đọc ghi bình thường', async () => {
    const legacy: Presentation = {
      template: 'editorial',
      brandKit: 'paper',
      slides: [{ layout: 'bullets', title: 'Ý chính', bullets: ['một', 'hai'] }],
    };
    const { note } = await createNote(userA, { ...base, presentation: legacy });
    expect((await getNote(userA, note.id)).presentation).toEqual(legacy);
  });
});
