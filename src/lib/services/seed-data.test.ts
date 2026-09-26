// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sections } from '@/lib/text';
import { SEED0, SEED, scoreOf } from './seed-data';

describe('SEED0', () => {
  const notes = SEED0();

  it('produces exactly the fourteen prototype notes, n1 through n14', () => {
    expect(notes).toHaveLength(14);
    expect(notes.map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => `n${i + 1}`));
  });

  it('keeps the prototype titles', () => {
    expect(notes[0].title).toBe('Phác đồ điều trị tăng huyết áp ở người lớn');
    expect(notes[1].title).toBe('Xử trí cấp cứu sốc phản vệ');
    expect(notes[13].title).toBe('Đọc công thức máu cơ bản');
  });

  it('marks n1, n2, n4 and n13 as favourites', () => {
    expect(notes.filter((n) => n.fav).map((n) => n.id)).toEqual(['n1', 'n2', 'n4', 'n13']);
  });

  it('keeps the prototype priorities', () => {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n.priority]));
    expect(byId).toMatchObject({
      n1: 'high',
      n2: 'high',
      n3: 'medium',
      n4: 'medium',
      n5: 'high',
      n6: 'medium',
      n7: 'low',
      n8: 'high',
      n9: 'medium',
      n10: 'medium',
      n11: 'low',
      n12: 'low',
      n13: 'high',
      n14: 'low',
    });
  });

  it('synthesises the version counts mk() implies', () => {
    const v = Object.fromEntries(notes.map((n) => [n.id, n.versions.length]));
    expect(v).toMatchObject({
      n1: 3,
      n2: 2,
      n3: 2,
      n4: 1,
      n5: 2,
      n6: 1,
      n7: 1,
      n8: 2,
      n9: 1,
      n10: 1,
      n11: 1,
      n12: 1,
      n13: 2,
      n14: 1,
    });
  });

  it('numbers versions 1..k in order and gives the last one the full content', () => {
    for (const n of notes) {
      expect(n.versions.map((x) => x.v)).toEqual(n.versions.map((_, i) => i + 1));
      expect(n.versions[n.versions.length - 1].content).toBe(n.content);
    }
  });

  it('names the first version "Tạo ghi chú"', () => {
    for (const n of notes) expect(n.versions[0].note).toBe('Tạo ghi chú');
  });

  it('attaches image metadata where the prototype does', () => {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n.images.length]));
    expect(byId).toMatchObject({ n1: 2, n2: 1, n4: 3, n11: 2, n3: 0, n5: 0 });
    expect(notes[0].images[0]).toMatchObject({ id: 'n1i0', label: 'Sơ đồ bậc điều trị', src: '' });
  });

  it('attaches the prototype comments', () => {
    expect(notes[0].comments).toHaveLength(2);
    expect(notes[0].comments[0].text).toContain('Lưu ý bệnh nhân cao tuổi');
    expect(notes[1].comments).toHaveLength(1);
    expect(notes[5].comments).toHaveLength(1);
  });

  it('orders created before updated on every note', () => {
    for (const n of notes) expect(n.created <= n.updated).toBe(true);
  });

  it('yields sections() usable by the offline quiz generator', () => {
    const secs = sections(notes[0].content);
    expect(secs.map((s) => s.h)).toContain('Ngưỡng chẩn đoán');
    expect(secs.map((s) => s.h)).toContain('Lựa chọn thuốc khởi đầu');
    expect(secs.every((s) => s.items.length > 0)).toBe(true);
  });

  it('gives every note at least one section with items, so offlineQuiz has material', () => {
    for (const n of notes) {
      expect(sections(n.content).length).toBeGreaterThan(0);
    }
  });

  it('carries the prototype tag vocabulary', () => {
    const all = new Set(notes.flatMap((n) => n.tags));
    expect(all).toContain('Tim mạch');
    expect(all).toContain('Phác đồ');
    expect(all).toContain('Cấp cứu');
    expect(all).toContain('Chẩn đoán hình ảnh');
    expect(all).toContain('Xét nghiệm');
  });

  it('starts every note with an empty quiz history', () => {
    for (const n of notes) expect(n.quizzes).toEqual([]);
  });
});

describe('SEED', () => {
  const notes = SEED();

  it('wraps the blockquote sentence on n1 in the hseed1 highlight', () => {
    expect(notes[0].content).toContain(
      '<mark data-hl="hseed1">Ưu tiên viên phối hợp liều cố định để cải thiện tuân thủ.</mark>',
    );
  });

  it('mirrors that highlight into n1 last version', () => {
    const last = notes[0].versions[notes[0].versions.length - 1];
    expect(last.content).toBe(notes[0].content);
    expect(last.content).toContain('data-hl="hseed1"');
  });

  it('does not add a version for the highlight', () => {
    expect(notes[0].versions).toHaveLength(3);
  });

  it('seeds n1 with the qs1 quiz record: offline, four questions', () => {
    const q = notes[0].quizzes[0];
    expect(notes[0].quizzes).toHaveLength(1);
    expect(q).toMatchObject({ id: 'qs1', total: 4, source: 'offline' });
    expect(q.questions).toHaveLength(4);
  });

  it('keeps every seeded question well formed', () => {
    for (const q of notes[0].quizzes[0].questions) {
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.explain.length).toBeGreaterThan(0);
    }
  });

  // part-0-contracts §8: score is COMPUTED, never hard-coded.
  it('computes score from picks vs answer for every seeded quiz', () => {
    for (const n of notes) {
      for (const q of n.quizzes) {
        expect(q.score).toBe(
          q.questions.filter((x, i) => q.picks[i] === x.answer).length,
        );
        expect(q.total).toBe(q.questions.length);
      }
    }
  });

  it('uses picks [0, 2, 1, 0] so the demo score is genuinely 3/4', () => {
    const q = notes[0].quizzes[0];
    expect(q.picks).toEqual([0, 2, 1, 0]);
    expect(q.score).toBe(3);
    expect(scoreOf(q.questions, q.picks)).toBe(3);
  });

  it('leaves the other thirteen notes without quizzes', () => {
    expect(notes.slice(1).every((n) => n.quizzes.length === 0)).toBe(true);
  });
});
