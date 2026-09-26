// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '@/lib/db';
import { useTempStorage, makeUser, dropUser } from '@/lib/services/helpers';
import { TOOLS, callTool } from './tools';

let cleanup: () => Promise<void>;
let userA = '';
let userB = '';

beforeAll(async () => {
  ({ cleanup } = await useTempStorage());
  userA = await makeUser('mcp_a');
  userB = await makeUser('mcp_b');
});
afterAll(async () => {
  await dropUser(userA);
  await dropUser(userB);
  await cleanup();
  await closeDb();
});

describe('tool registry', () => {
  it('exposes exactly the tools SPEC 2.4 names, in order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'list_notes',
      'search_notes',
      'get_note',
      'create_note',
      'update_note',
      'delete_note',
      'list_tags',
      'set_quiz_questions',
      'get_quiz_questions',
      'create_quiz',
      'list_quizzes',
    ]);
  });

  it('gives every tool a zod input schema and a non-empty description', () => {
    for (const t of TOOLS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.inputSchema.parse).toBe('function');
    }
  });

  it('rejects an unknown tool name', async () => {
    await expect(callTool('drop_database', userA, {})).rejects.toMatchObject({ status: 404 });
  });
});

describe('create_note / get_note / update_note', () => {
  it('creates a note at v1 and reads it back', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Ghi chú do Claude tạo',
      desc: 'Từ MCP',
      tags: ['Tim mạch'],
      priority: 'high',
      content: '<h2>A</h2><p>một</p>',
    })) as { note: { id: string }; version: number };

    expect(created.version).toBe(1);
    const got = (await callTool('get_note', userA, { id: created.note.id })) as {
      note: { title: string; versions: unknown[] };
    };
    expect(got.note.title).toBe('Ghi chú do Claude tạo');
    expect(got.note.versions).toHaveLength(1);
  });

  it('rejects a create with a bad priority before touching storage', async () => {
    await expect(
      callTool('create_note', userA, { title: 'x', priority: 'urgent' }),
    ).rejects.toThrow();
  });

  it('updates only the fields supplied, bumping the version on a content change', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Bản gốc',
      content: '<p>v1</p>',
      tags: ['A'],
      priority: 'low',
      desc: 'd',
    })) as { note: { id: string } };

    const patched = (await callTool('update_note', userA, {
      id: created.note.id,
      content: '<p>v2</p>',
    })) as { version: number; note: { title: string; tags: string[]; priority: string } };

    expect(patched.version).toBe(2);
    expect(patched.note.title).toBe('Bản gốc');
    expect(patched.note.tags).toEqual(['A']);
    expect(patched.note.priority).toBe('low');
  });

  it('does not bump the version when only the description is updated', async () => {
    const created = (await callTool('create_note', userA, {
      title: 't',
      content: '<p>x</p>',
    })) as { note: { id: string } };
    const patched = (await callTool('update_note', userA, {
      id: created.note.id,
      desc: 'chỉ đổi mô tả',
    })) as { version: number };
    expect(patched.version).toBe(1);
  });

  it('404s for a note the caller does not own', async () => {
    const created = (await callTool('create_note', userA, {
      title: 't',
      content: '<p>x</p>',
    })) as { note: { id: string } };
    await expect(callTool('get_note', userB, { id: created.note.id })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      callTool('update_note', userB, { id: created.note.id, desc: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(callTool('delete_note', userB, { id: created.note.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('list_notes / search_notes / list_tags', () => {
  it('lists the caller notes with pagination metadata', async () => {
    await callTool('create_note', userA, { title: 'Một', content: '<p>a</p>', tags: ['Tim mạch'] });
    const out = (await callTool('list_notes', userA, { pageSize: 3 })) as {
      notes: unknown[];
      total: number;
      pageSize: number;
    };
    expect(out.pageSize).toBe(3);
    expect(out.notes.length).toBeLessThanOrEqual(3);
    expect(out.total).toBeGreaterThan(0);
  });

  it('searches accent-insensitively', async () => {
    await callTool('create_note', userA, { title: 'Đái tháo đường type 2', content: '<p>x</p>' });
    const out = (await callTool('search_notes', userA, { query: 'dai thao duong' })) as {
      notes: { title: string }[];
    };
    expect(out.notes.some((n) => n.title === 'Đái tháo đường type 2')).toBe(true);
  });

  it('restricts a # search to tags', async () => {
    await callTool('create_note', userA, {
      title: 'Không phải thẻ',
      content: '<p>x</p>',
      tags: ['Hô hấp'],
    });
    const out = (await callTool('search_notes', userA, { query: '#ho hap' })) as {
      notes: { tags: string[] }[];
    };
    expect(out.notes.length).toBeGreaterThan(0);
    for (const n of out.notes) expect(n.tags.some((t) => t.includes('Hô hấp'))).toBe(true);
  });

  it('lists tags with counts, never another user tags', async () => {
    await callTool('create_note', userB, {
      title: 'B',
      content: '<p>x</p>',
      tags: ['Chỉ của B'],
    });
    const out = (await callTool('list_tags', userA, {})) as { tags: { name: string }[] };
    expect(out.tags.some((t) => t.name === 'Chỉ của B')).toBe(false);
    expect(out.tags.some((t) => t.name === 'Tim mạch')).toBe(true);
  });
});

describe('delete_note', () => {
  it('deletes and then 404s', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'xoá',
      content: '<p>x</p>',
    })) as { note: { id: string } };
    expect(await callTool('delete_note', userA, { id: created.note.id })).toEqual({ ok: true });
    await expect(callTool('get_note', userA, { id: created.note.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('create_quiz / list_quizzes', () => {
  it('generates questions offline and records them', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Quiz nguồn',
      content:
        '<h2>A</h2><ul><li>một</li><li>hai</li><li>ba</li></ul>' +
        '<h2>B</h2><ul><li>bốn</li><li>năm</li><li>sáu</li></ul>',
      tags: ['Tim mạch'],
    })) as { note: { id: string } };

    const gen = (await callTool('create_quiz', userA, { id: created.note.id })) as {
      source: string;
      quiz: { total: number; questions: unknown[] };
    };
    expect(['ai', 'offline']).toContain(gen.source);
    expect(gen.quiz.questions.length).toBe(gen.quiz.total);

    const listed = (await callTool('list_quizzes', userA, { id: created.note.id })) as {
      quizzes: unknown[];
    };
    expect(listed.quizzes).toHaveLength(1);
  });

  it('records a score of 0 because MCP supplies no answers', async () => {
    const created = (await callTool('create_note', userA, {
      title: 'Quiz điểm',
      content: '<h2>A</h2><ul><li>x</li><li>y</li><li>z</li></ul>',
    })) as { note: { id: string } };
    const gen = (await callTool('create_quiz', userA, { id: created.note.id })) as {
      quiz: { score: number; picks: (number | null)[] };
    };
    expect(gen.quiz.score).toBe(0);
    expect(gen.quiz.picks.every((p) => p === null)).toBe(true);
  });

  it('404s create_quiz for another user note', async () => {
    const created = (await callTool('create_note', userA, {
      title: 't',
      content: '<h2>A</h2><p>x</p>',
    })) as { note: { id: string } };
    await expect(callTool('create_quiz', userB, { id: created.note.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('bộ câu hỏi soạn sẵn qua MCP', () => {
  const run = (name: string, input: unknown) => callTool(name, userA, input);

  const q = (n: number) => ({
    q: `Câu ${n}?`,
    options: [`${n}A`, `${n}B`, `${n}C`, `${n}D`],
    answer: 2,
    explain: `Vì ${n}`,
  });

  it('creates a note with its questions in one call', async () => {
    const { note } = (await run('create_note', {
      title: 'Ghi chú có sẵn câu hỏi',
      content: '<p>x</p>',
      questions: [q(1), q(2)],
    })) as { note: { id: string; questions: unknown[] } };

    expect(note.questions).toHaveLength(2);
    const read = (await run('get_quiz_questions', { id: note.id })) as { questions: unknown[] };
    expect(read.questions).toHaveLength(2);
  });

  it('sets the bank of an existing note without touching its content or versions', async () => {
    const { note } = (await run('create_note', {
      title: 'Ghi chú soạn sau',
      content: '<p>nội dung gốc</p>',
    })) as { note: { id: string; versions: unknown[] } };
    const versionsBefore = note.versions.length;

    const res = (await run('set_quiz_questions', { id: note.id, questions: [q(1)] })) as {
      ok: boolean;
      count: number;
    };
    expect(res).toEqual({ ok: true, count: 1 });

    const after = (await run('get_note', { id: note.id })) as {
      note: { content: string; versions: unknown[]; questions: unknown[] };
    };
    expect(after.note.content).toBe('<p>nội dung gốc</p>');
    expect(after.note.versions).toHaveLength(versionsBefore);
    expect(after.note.questions).toHaveLength(1);
  });

  it('replaces the bank rather than appending to it', async () => {
    const { note } = (await run('create_note', {
      title: 'Ghi chú thay bộ câu hỏi',
      questions: [q(1), q(2), q(3)],
    })) as { note: { id: string } };

    await run('set_quiz_questions', { id: note.id, questions: [q(9)] });
    const read = (await run('get_quiz_questions', { id: note.id })) as {
      questions: { q: string }[];
    };
    expect(read.questions.map((x) => x.q)).toEqual(['Câu 9?']);
  });

  /**
   * Chỗ dễ mất dữ liệu nhất: `update_note` là thay-toàn-phần, nên nếu bỏ
   * trống `questions` mà bị hiểu thành "xoá sạch" thì mỗi lần sửa tiêu đề là
   * mất bộ câu hỏi.
   */
  it('keeps the bank when an update does not mention it', async () => {
    const { note } = (await run('create_note', {
      title: 'Ghi chú giữ câu hỏi',
      questions: [q(1), q(2)],
    })) as { note: { id: string } };

    await run('update_note', { id: note.id, title: 'Tiêu đề mới' });

    const read = (await run('get_quiz_questions', { id: note.id })) as { questions: unknown[] };
    expect(read.questions).toHaveLength(2);
  });

  it('empties the bank only when asked explicitly', async () => {
    const { note } = (await run('create_note', {
      title: 'Ghi chú xoá câu hỏi',
      questions: [q(1)],
    })) as { note: { id: string } };

    await run('set_quiz_questions', { id: note.id, questions: [] });
    const read = (await run('get_quiz_questions', { id: note.id })) as { questions: unknown[] };
    expect(read.questions).toEqual([]);
  });

  it('refuses a question that is not answerable', async () => {
    await expect(
      run('set_quiz_questions', {
        id: 'n1',
        questions: [{ q: 'thiếu lựa chọn', options: ['a', 'b'], answer: 0, explain: '' }],
      }),
    ).rejects.toThrow();
  });
});
