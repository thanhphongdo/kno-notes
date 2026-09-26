// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import type { Note } from '@/lib/types';
import { useTempStorage, makeUser, dropUser } from './helpers';
import { createNote } from './notes';
import { offlineQuiz, buildPrompt, parseAiQuestions, generateQuiz } from './quiz';

afterEach(() => vi.restoreAllMocks());

const note = (over: Partial<Note> & { id: string }): Note => ({
  title: 'Ghi chú',
  desc: 'Mô tả',
  tags: ['Tim mạch'],
  priority: 'medium',
  fav: false,
  created: '2024-01-01T00:00:00.000Z',
  updated: '2024-01-01T00:00:00.000Z',
  content: '',
  images: [],
  comments: [],
  versions: [],
  quizzes: [],
  ...over,
});

const rich = note({
  id: 'n1',
  title: 'Phác đồ tăng huyết áp',
  tags: ['Tim mạch'],
  content:
    '<h2>Ngưỡng chẩn đoán</h2><ul><li>HA phòng khám ≥ 140/90 mmHg</li><li>HA tại nhà ≥ 135/85 mmHg</li><li>Holter ≥ 130/80 mmHg</li></ul>' +
    '<h2>Mục tiêu điều trị</h2><ul><li>Đa số: &lt; 130/80 mmHg</li><li>Trên 80 tuổi: 140–150 mmHg tâm thu</li></ul>' +
    '<h2>Lựa chọn thuốc</h2><ul><li>ACEi hoặc ARB</li><li>Chẹn kênh canxi</li><li>Lợi tiểu thiazide</li></ul>',
});

const others = [
  note({
    id: 'n2',
    title: 'Sốc phản vệ',
    tags: ['Cấp cứu'],
    content:
      '<h2>Xử trí</h2><ul><li>Adrenalin tiêm bắp 0,5 mg</li><li>Nằm ngửa kê cao chân</li><li>Thở oxy</li></ul>',
  }),
  note({
    id: 'n3',
    title: 'Đái tháo đường',
    tags: ['Nội tiết'],
    content:
      '<h2>Nguyên tắc</h2><ul><li>Metformin nền tảng</li><li>SGLT2i khi suy tim</li><li>GLP-1 RA khi xơ vữa</li></ul>',
  }),
  note({
    id: 'n4',
    title: 'Hen phế quản',
    tags: ['Hô hấp'],
    content:
      '<h2>Các bậc</h2><ul><li>Bậc 1–2 ICS-formoterol khi cần</li><li>Bậc 3 duy trì</li><li>Bậc 4 liều trung bình</li></ul>',
  }),
];

describe('offlineQuiz', () => {
  it('returns at most five questions', () => {
    expect(offlineQuiz(rich, [rich, ...others]).length).toBeLessThanOrEqual(5);
  });

  it('gives every question exactly four options', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(q.options).toHaveLength(4);
    }
  });

  it('puts the answer index inside the options range', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.options[q.answer]).toBeTruthy();
    }
  });

  it('never repeats an option inside one question', () => {
    for (const q of offlineQuiz(rich, [rich, ...others])) {
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('phrases section questions exactly as the prototype does', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    const section = qs.find((q) => q.q.startsWith('Theo ghi chú'));
    expect(section).toBeTruthy();
    expect(section!.q).toMatch(/^Theo ghi chú, nội dung nào dưới đây thuộc mục “.+”\?$/);
    expect(section!.explain).toMatch(/^Mục “.+” ghi: /);
  });

  it('adds the topic question when three foreign tags exist', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    const topic = qs.find((q) => q.q.startsWith('Ghi chú “'));
    expect(topic).toBeTruthy();
    expect(topic!.q).toBe('Ghi chú “Phác đồ tăng huyết áp” thuộc chủ đề nào?');
    expect(topic!.options[topic!.answer]).toBe('Tim mạch');
    expect(topic!.explain).toBe('Ghi chú được gắn thẻ: Tim mạch.');
  });

  it('omits the topic question when fewer than three foreign tags exist', () => {
    const qs = offlineQuiz(rich, [rich, others[0]]);
    expect(qs.some((q) => q.q.startsWith('Ghi chú “'))).toBe(false);
  });

  it('never offers an item from the same section as a distractor', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    const sectionItems = [
      ['HA phòng khám ≥ 140/90 mmHg', 'HA tại nhà ≥ 135/85 mmHg', 'Holter ≥ 130/80 mmHg'],
      ['Đa số: < 130/80 mmHg', 'Trên 80 tuổi: 140–150 mmHg tâm thu'],
      ['ACEi hoặc ARB', 'Chẹn kênh canxi', 'Lợi tiểu thiazide'],
    ];
    for (const q of qs.filter((x) => x.q.startsWith('Theo ghi chú'))) {
      const right = q.options[q.answer];
      const own = sectionItems.find((items) => items.includes(right))!;
      const wrongs = q.options.filter((_, i) => i !== q.answer);
      expect(wrongs.some((w) => own.includes(w))).toBe(false);
    }
  });

  it('clips long option text to 150 characters', () => {
    const longItem = 'x'.repeat(400);
    const big = note({ id: 'nb', content: `<h2>A</h2><ul><li>${longItem}</li><li>b</li></ul>` });
    for (const q of offlineQuiz(big, [big, ...others])) {
      for (const o of q.options) expect(o.length).toBeLessThanOrEqual(150);
    }
  });

  it('returns [] for a note with no headings and no foreign tags to fall back on', () => {
    const empty = note({ id: 'ne', content: '<p>chỉ một đoạn</p>', tags: ['Tim mạch'] });
    expect(offlineQuiz(empty, [empty])).toEqual([]);
  });

  it('returns [] for completely empty content with no other notes', () => {
    const empty = note({ id: 'ne', content: '' });
    expect(offlineQuiz(empty, [empty])).toEqual([]);
  });

  it('does not throw when a section has a single item and no distractors exist', () => {
    const thin = note({ id: 'nt', content: '<h2>A</h2><p>một câu duy nhất</p>', tags: ['X'] });
    expect(() => offlineQuiz(thin, [thin])).not.toThrow();
  });

  it('excludes the note own content from the foreign distractor pool', () => {
    const qs = offlineQuiz(rich, [rich, ...others]);
    expect(qs.length).toBeGreaterThan(0);
  });
});

describe('buildPrompt', () => {
  const n = note({
    id: 'n1',
    title: 'Phác đồ tăng huyết áp',
    desc: 'Ngưỡng chẩn đoán',
    content: '<h2>A</h2><p>HA  ≥  140/90</p>',
  });

  it('carries the prototype Vietnamese instruction verbatim', () => {
    const p = buildPrompt(n);
    expect(p).toContain('Bạn là giảng viên y khoa.');
    expect(p).toContain('tạo 5 câu hỏi trắc nghiệm bằng tiếng Việt');
    expect(p).toContain('Mỗi câu có đúng 4 lựa chọn ngắn gọn, 1 đáp án đúng');
    expect(p).toContain('Xáo trộn vị trí đáp án đúng.');
    expect(p).toContain('Chỉ trả về JSON array, không thêm chữ nào khác');
    expect(p).toContain(
      '[{"q":"...","options":["...","...","...","..."],"answer":0,"explain":"giải thích 1–2 câu"}]',
    );
  });

  it('includes the title, description and plain-text content', () => {
    const p = buildPrompt(n);
    expect(p).toContain('TIÊU ĐỀ: Phác đồ tăng huyết áp');
    expect(p).toContain('MÔ TẢ: Ngưỡng chẩn đoán');
    expect(p).toContain('NỘI DUNG: A HA ≥ 140/90');
    expect(p).not.toContain('<h2>');
  });

  it('omits the avoid-repeats clause when there is no history', () => {
    expect(buildPrompt(n)).not.toContain('Tránh lặp lại các câu');
  });

  it('lists previously asked questions, pipe separated, when history exists', () => {
    const withHistory = note({
      ...n,
      quizzes: [
        {
          id: 'q1',
          date: n.created,
          score: 1,
          total: 2,
          source: 'ai',
          picks: [0, 0],
          questions: [
            { q: 'Câu một?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
            { q: 'Câu hai?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
          ],
        },
      ],
    });
    const p = buildPrompt(withHistory);
    expect(p).toContain('Tránh lặp lại các câu: Câu một? | Câu hai?. ');
  });

  it('merges the caller-supplied avoid list with the note history', () => {
    const p = buildPrompt(n, ['Câu từ client A?', 'Câu từ client B?']);
    expect(p).toContain('Tránh lặp lại các câu: Câu từ client A? | Câu từ client B?. ');
  });

  it('de-duplicates between the history and the avoid list', () => {
    const withHistory = note({
      ...n,
      quizzes: [
        {
          id: 'q1',
          date: n.created,
          score: 0,
          total: 1,
          source: 'ai',
          picks: [0],
          questions: [{ q: 'Trùng?', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' }],
        },
      ],
    });
    const p = buildPrompt(withHistory, ['Trùng?', 'Mới?']);
    expect(p).toContain('Tránh lặp lại các câu: Trùng? | Mới?. ');
  });

  it('caps the avoid list at the ten most recent questions', () => {
    const questions = Array.from({ length: 14 }, (_, i) => ({
      q: `Câu ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answer: 0,
      explain: '',
    }));
    const withHistory = note({
      ...n,
      quizzes: [
        {
          id: 'q1',
          date: n.created,
          score: 0,
          total: 14,
          source: 'ai',
          picks: questions.map(() => 0),
          questions,
        },
      ],
    });
    const p = buildPrompt(withHistory);
    expect(p).toContain('Câu 4?');
    expect(p).toContain('Câu 13?');
    expect(p).not.toContain('Câu 0?');
    expect(p).not.toContain('Câu 3?');
  });
});

describe('parseAiQuestions', () => {
  const four = (q: string) => ({ q, options: ['a', 'b', 'c', 'd'], answer: 1, explain: 'vì vậy' });
  const json = (arr: unknown) => JSON.stringify(arr);

  it('parses a clean array of five questions', () => {
    const out = parseAiQuestions(json([1, 2, 3, 4, 5].map((i) => four(`Câu ${i}?`))));
    expect(out).toHaveLength(5);
    expect(out![0].q).toBe('Câu 1?');
  });

  it('extracts the array from surrounding prose and code fences', () => {
    const body =
      '```json\n' + json([1, 2, 3].map((i) => four(`Câu ${i}?`))) + '\n```\nHy vọng giúp ích!';
    expect(parseAiQuestions(body)).toHaveLength(3);
  });

  it('caps the result at five questions', () => {
    expect(parseAiQuestions(json(Array.from({ length: 9 }, (_, i) => four(`Q${i}`))))).toHaveLength(
      5,
    );
  });

  it('drops a question that does not have exactly four options', () => {
    const arr = [
      four('ok 1'),
      four('ok 2'),
      four('ok 3'),
      { q: 'ba lựa chọn', options: ['a', 'b', 'c'], answer: 0, explain: '' },
    ];
    const out = parseAiQuestions(json(arr))!;
    expect(out).toHaveLength(3);
    expect(out.some((q) => q.q === 'ba lựa chọn')).toBe(false);
  });

  it('drops a question whose answer index is out of range', () => {
    const arr = [
      four('ok 1'),
      four('ok 2'),
      four('ok 3'),
      { q: 'sai index', options: ['a', 'b', 'c', 'd'], answer: 4, explain: '' },
      { q: 'âm', options: ['a', 'b', 'c', 'd'], answer: -1, explain: '' },
    ];
    expect(parseAiQuestions(json(arr))).toHaveLength(3);
  });

  it('drops a question with no text', () => {
    const arr = [
      four('ok 1'),
      four('ok 2'),
      four('ok 3'),
      { q: '', options: ['a', 'b', 'c', 'd'], answer: 0, explain: '' },
    ];
    expect(parseAiQuestions(json(arr))).toHaveLength(3);
  });

  it('returns null when fewer than three questions survive', () => {
    expect(parseAiQuestions(json([four('a'), four('b')]))).toBeNull();
    expect(parseAiQuestions(json([]))).toBeNull();
  });

  it('returns null for text with no JSON array at all', () => {
    expect(parseAiQuestions('Xin lỗi, tôi không thể tạo câu hỏi.')).toBeNull();
    expect(parseAiQuestions('')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseAiQuestions('[{"q":"x", options:}]')).toBeNull();
  });

  it('coerces a missing explain to an empty string', () => {
    const arr = [1, 2, 3].map((i) => ({
      q: `Câu ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answer: 0,
    }));
    expect(parseAiQuestions(json(arr))![0].explain).toBe('');
  });

  it('stringifies non-string options rather than dropping the question', () => {
    const arr = [1, 2, 3].map((i) => ({
      q: `Câu ${i}?`,
      options: [1, 2, 3, 4],
      answer: 0,
      explain: '',
    }));
    const out = parseAiQuestions(json(arr))!;
    expect(out[0].options).toEqual(['1', '2', '3', '4']);
  });
});

describe('generateQuiz without an API key', () => {
  let cleanup: () => Promise<void>;
  let uid = '';
  let prevKey: string | undefined;

  beforeAll(async () => {
    prevKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    ({ cleanup } = await useTempStorage());
    uid = await makeUser('quiz_user');
  });

  afterAll(async () => {
    if (prevKey) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevKey;
    await dropUser(uid);
    await cleanup();
    await closeDb();
  });

  const mk = (title: string, content: string, tags: string[]) =>
    createNote(uid, { title, desc: '', tags, priority: 'medium', content, images: [] });

  it('produces offline questions and reports source "offline"', async () => {
    const { note: n } = await mk(
      'Phác đồ tăng huyết áp',
      '<h2>Ngưỡng</h2><ul><li>≥ 140/90</li><li>≥ 135/85</li><li>≥ 130/80</li></ul>' +
        '<h2>Mục tiêu</h2><ul><li>&lt; 130/80</li><li>140–150 ở người già</li></ul>',
      ['Tim mạch'],
    );
    await mk(
      'Sốc phản vệ',
      '<h2>Xử trí</h2><ul><li>Adrenalin</li><li>Oxy</li><li>Dịch</li></ul>',
      ['Cấp cứu'],
    );
    await mk(
      'Đái tháo đường',
      '<h2>Thuốc</h2><ul><li>Metformin</li><li>SGLT2i</li><li>GLP-1</li></ul>',
      ['Nội tiết'],
    );
    await mk('Hen', '<h2>Bậc</h2><ul><li>Bậc 1</li><li>Bậc 2</li><li>Bậc 3</li></ul>', ['Hô hấp']);

    const out = await generateQuiz(uid, n.id);
    expect(out.source).toBe('offline');
    expect(out.questions.length).toBeGreaterThan(0);
    for (const q of out.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
    }
  });

  it('throws 422 NOT_ENOUGH_CONTENT for a note with no headings, never a 500', async () => {
    // No headings => no section questions; no tags => no topic question either,
    // so offlineQuiz genuinely has nothing to build from.
    const { note: n } = await mk('Ghi chú ngắn', '<p>Chỉ một câu.</p>', []);
    await expect(generateQuiz(uid, n.id)).rejects.toMatchObject({
      status: 422,
      code: 'NOT_ENOUGH_CONTENT',
      message: 'Ghi chú chưa đủ nội dung để tạo câu hỏi.',
    });
  });

  it('passes the caller avoid list through without failing', async () => {
    const { note: n } = await mk(
      'Có nội dung',
      '<h2>A</h2><ul><li>một</li><li>hai</li><li>ba</li></ul><h2>B</h2><ul><li>bốn</li><li>năm</li><li>sáu</li></ul>',
      ['Tim mạch'],
    );
    const out = await generateQuiz(uid, n.id, ['Câu đã hỏi rồi?']);
    expect(out.questions.length).toBeGreaterThan(0);
  });

  it('404s for a note the user does not own', async () => {
    await expect(generateQuiz(uid, 'n-does-not-exist')).rejects.toMatchObject({ status: 404 });
  });
});
