// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from '@/lib/services/helpers';
import { getNote } from '@/lib/services/notes';
import type { Presentation } from '@/lib/types';
import {
  ICON_NAMES,
  PRESENTATION_MOTIONS,
  PRESENTATION_PATTERNS,
} from '@/lib/presentation/schema';
import { TOOLS, callTool, findTool } from './tools';

let cleanup: () => Promise<void>;
let userA = '';

const pres = (slides = 2): Presentation => ({
  template: 'editorial',
  brandKit: 'paper',
  slides: Array.from({ length: slides }, (_, i) => ({
    layout: 'section' as const,
    title: `Phần ${i + 1}`,
  })),
});

const newNote = async (extra: Record<string, unknown> = {}) => {
  const res = (await callTool('create_note', userA, {
    title: 'Đái tháo đường type 2',
    content: '<p>x</p>',
    ...extra,
  })) as { note: { id: string } };
  return res.note.id;
};

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('mcp_pres_a');
});
afterAll(async () => {
  await dropUser(userA);
  await cleanup();
  await closeDb();
});

describe('đăng ký tool', () => {
  it('có set_presentation và get_presentation', () => {
    expect(TOOLS.map((t) => t.name)).toContain('set_presentation');
    expect(TOOLS.map((t) => t.name)).toContain('get_presentation');
  });

  it('mô tả tool nói rõ giới hạn 60 slide và danh sách layout', () => {
    const d = findTool('set_presentation')!.description;
    expect(d).toContain('60');
    for (const layout of ['title', 'section', 'bullets', 'two-col', 'image', 'quote', 'stat', 'end']) {
      expect(d).toContain(layout);
    }
  });
});

describe('mô tả PRESENTATION_GUIDE', () => {
  const d = () => findTool('set_presentation')!.description;

  it('liệt kê đủ 18 icon', () => {
    for (const icon of ICON_NAMES) expect(d()).toContain(`"${icon}"`);
  });

  it('liệt kê đủ 21 tên nền và 3 mức chuyển động', () => {
    for (const p of PRESENTATION_PATTERNS) expect(d()).toContain(`"${p}"`);
    for (const m of PRESENTATION_MOTIONS) expect(d()).toContain(`"${m}"`);
    expect(d()).toContain('pattern');
    expect(d()).toContain('motion');
  });

  it('không còn tên nền cũ', () => {
    for (const old of ['"grid"', '"dots"', '"rule"', '"hatch"']) {
      expect(d()).not.toContain(old);
    }
  });

  it('chia nền thành nhóm rìa / phủ và tả ngắn từng tên', () => {
    expect(d()).toContain('rìa');
    expect(d()).toContain('phủ');
    // Mỗi tên nền phải đi kèm một mô tả, không được dán tên trần.
    for (const p of PRESENTATION_PATTERNS) {
      if (p === 'none') continue;
      expect(d()).toMatch(new RegExp(`"${p}" = \\S`));
    }
  });

  it('dặn cách chọn nền', () => {
    expect(d()).toContain('color-block');
    expect(d()).toMatch(/nhiều chữ/);
  });

  it('nói rõ hai dạng viết của một gạch đầu dòng và có ví dụ JSON kèm icon', () => {
    expect(d()).toContain('{ text');
    expect(d()).toContain('"icon"');
    expect(d()).toContain('Ví dụ');
  });

  it('dặn dùng icon cho thưa', () => {
    expect(d()).toMatch(/thưa|điểm nhấn/);
  });
});

describe('set_presentation / get_presentation', () => {
  it('nhận bullet có icon, pattern và motion', async () => {
    const id = await newNote();
    expect(
      await callTool('set_presentation', userA, {
        id,
        presentation: {
          template: 'deck',
          brandKit: 'mint',
          pattern: 'paper-fiber',
          motion: 'none',
          slides: [
            { layout: 'bullets', title: 'T', icon: 'list', bullets: ['trần', { text: 'a', icon: 'alert' }] },
          ],
        },
      }),
    ).toEqual({ ok: true, slideCount: 1 });
    expect((await getNote(userA, id)).presentation).toMatchObject({
      pattern: 'paper-fiber',
      motion: 'none',
    });
  });

  it('ghi rồi đọc lại đúng bộ slide', async () => {
    const id = await newNote();
    expect(await callTool('set_presentation', userA, { id, presentation: pres(3) })).toEqual({
      ok: true,
      slideCount: 3,
    });
    expect(await callTool('get_presentation', userA, { id })).toMatchObject({
      presentation: { template: 'editorial', brandKit: 'paper' },
    });
  });

  it('trả null khi ghi chú chưa có trình chiếu', async () => {
    const id = await newNote();
    expect(await callTool('get_presentation', userA, { id })).toEqual({ presentation: null });
  });

  it('KHÔNG tạo phiên bản mới', async () => {
    const id = await newNote();
    await callTool('set_presentation', userA, { id, presentation: pres(2) });
    expect((await getNote(userA, id)).versions).toHaveLength(1);
  });

  it('xoá trình chiếu khi truyền null', async () => {
    const id = await newNote({ presentation: pres(2) });
    expect(await callTool('set_presentation', userA, { id, presentation: null })).toEqual({
      ok: true,
      slideCount: 0,
    });
    expect(await callTool('get_presentation', userA, { id })).toEqual({ presentation: null });
  });

  it('từ chối JSON trình chiếu sai luật', async () => {
    const id = await newNote();
    await expect(
      callTool('set_presentation', userA, {
        id,
        presentation: { template: 'deck', brandKit: 'mint', slides: [{ layout: 'carousel' }] },
      }),
    ).rejects.toThrow();
    await expect(
      callTool('set_presentation', userA, {
        id,
        presentation: { template: 'deck', brandKit: 'mint', slides: [] },
      }),
    ).rejects.toThrow();
  });

  it('404 với ghi chú của người khác', async () => {
    const userB = await makeUser('mcp_pres_b');
    const id = await newNote();
    await expect(
      callTool('set_presentation', userB, { id, presentation: pres(1) }),
    ).rejects.toMatchObject({ status: 404 });
    await dropUser(userB);
  });
});

describe('create_note / update_note', () => {
  it('create_note nhận presentation tuỳ chọn', async () => {
    const id = await newNote({ presentation: pres(4) });
    expect((await getNote(userA, id)).presentation?.slides).toHaveLength(4);
  });

  it('update_note GIỮ NGUYÊN trình chiếu khi không truyền', async () => {
    const id = await newNote({ presentation: pres(3) });
    await callTool('update_note', userA, { id, title: 'Tiêu đề khác' });
    expect((await getNote(userA, id)).presentation?.slides).toHaveLength(3);
  });

  it('update_note xoá trình chiếu khi truyền null', async () => {
    const id = await newNote({ presentation: pres(3) });
    await callTool('update_note', userA, { id, presentation: null });
    expect((await getNote(userA, id)).presentation).toBeNull();
  });
});
