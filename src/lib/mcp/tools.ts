// src/lib/mcp/tools.ts
// Logic của tool sống TÁCH KHỎI transport: file này không biết gì về JSON-RPC,
// nên test được mà không cần transport, và đổi transport chỉ sửa route.ts.
import { z } from 'zod';
import { PrioritySchema } from '@/lib/api/schemas';
import { HttpError } from '@/lib/http';
import {
  addQuizRecord,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from '@/lib/services/notes';
import { generateQuiz } from '@/lib/services/quiz';
import { listTags } from '@/lib/services/tags';
import { DEFAULT_PAGE_SIZE, type Priority, type SortKey } from '@/lib/types';

export interface McpTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  run(userId: string, input: z.infer<S>): Promise<unknown>;
}

const FiltersShape = {
  query: z
    .string()
    .optional()
    .describe('Từ khoá. Tiền tố # để chỉ tìm trong thẻ, vd "#Tim mạch".'),
  tag: z.string().optional().describe('Lọc theo tên thẻ chính xác.'),
  priority: PrioritySchema.optional().describe('Lọc theo mức ưu tiên.'),
  favorite: z.boolean().optional().describe('Chỉ lấy ghi chú đã đánh dấu yêu thích.'),
  sort: z.enum(['updated', 'priority', 'title']).optional().describe('Mặc định "updated".'),
  page: z.number().int().min(1).optional().describe('Trang, bắt đầu từ 1.'),
  pageSize: z.number().int().min(1).max(100).optional().describe('Mặc định 6, tối đa 100.'),
};

const toFilters = (i: Record<string, unknown>) => ({
  query: (i.query as string) ?? '',
  nav: i.favorite ? ('fav' as const) : ('all' as const),
  priority: (i.priority as Priority | undefined) ?? null,
  tag: (i.tag as string | undefined) ?? null,
  sort: (i.sort as SortKey | undefined) ?? ('updated' as SortKey),
  page: (i.page as number | undefined) ?? 1,
  pageSize: (i.pageSize as number | undefined) ?? DEFAULT_PAGE_SIZE,
});

const IdShape = { id: z.string().min(1).max(128).describe('Mã ghi chú, vd "n1".') };

const listNotesTool: McpTool = {
  name: 'list_notes',
  description:
    'Liệt kê ghi chú của người dùng với bộ lọc và phân trang. Trả về bản rút gọn (không có nội dung HTML đầy đủ) — dùng get_note để lấy nội dung.',
  inputSchema: z.object(FiltersShape),
  run: (userId, input) => listNotes(userId, toFilters(input as Record<string, unknown>)),
};

const searchNotesTool: McpTool = {
  name: 'search_notes',
  description:
    'Tìm ghi chú theo tiêu đề, mô tả và thẻ. Không phân biệt dấu tiếng Việt ("dai thao duong" khớp "Đái tháo đường"). Tiền tố # chỉ tìm trong thẻ.',
  inputSchema: z.object({
    ...FiltersShape,
    query: z.string().min(1).describe('Từ khoá bắt buộc. Tiền tố # để chỉ tìm trong thẻ.'),
  }),
  run: (userId, input) => listNotes(userId, toFilters(input as Record<string, unknown>)),
};

const getNoteTool: McpTool = {
  name: 'get_note',
  description:
    'Lấy một ghi chú đầy đủ: nội dung HTML, thẻ, lịch sử phiên bản, bình luận, ảnh và lịch sử trắc nghiệm.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => ({ note: await getNote(userId, (input as { id: string }).id) }),
};

const createNoteTool: McpTool = {
  name: 'create_note',
  description:
    'Tạo ghi chú mới ở phiên bản v1. Nội dung là HTML đơn giản: h2, h3, p, ul/ol/li, blockquote, table, strong, em.',
  inputSchema: z.object({
    title: z.string().min(1).max(300).describe('Tiêu đề ghi chú.'),
    desc: z.string().max(1000).optional().describe('Mô tả ngắn hiển thị trên thẻ ghi chú.'),
    tags: z
      .array(z.string().min(1).max(80))
      .max(20)
      .optional()
      .describe('Danh sách thẻ, vd ["Tim mạch"].'),
    priority: PrioritySchema.optional().describe('Mặc định "medium".'),
    content: z.string().max(400_000).optional().describe('Nội dung HTML.'),
    changeNote: z.string().max(200).optional().describe('Ghi chú thay đổi. Mặc định "Tạo ghi chú".'),
  }),
  run: (userId, input) => {
    const i = input as Record<string, unknown>;
    return createNote(userId, {
      title: i.title as string,
      desc: (i.desc as string) ?? '',
      tags: (i.tags as string[]) ?? [],
      priority: (i.priority as Priority) ?? 'medium',
      content: (i.content as string) ?? '',
      images: [],
      changeNote: i.changeNote as string | undefined,
    });
  },
};

const updateNoteTool: McpTool = {
  name: 'update_note',
  description:
    'Cập nhật ghi chú. Chỉ trường nào được truyền mới bị thay đổi. Phiên bản CHỈ tăng khi tiêu đề hoặc nội dung đổi.',
  inputSchema: z.object({
    ...IdShape,
    title: z.string().min(1).max(300).optional(),
    desc: z.string().max(1000).optional(),
    tags: z.array(z.string().min(1).max(80)).max(20).optional(),
    priority: PrioritySchema.optional(),
    content: z.string().max(400_000).optional(),
    changeNote: z.string().max(200).optional().describe('Mặc định "Cập nhật nội dung".'),
  }),
  run: async (userId, input) => {
    const i = input as Record<string, unknown>;
    const id = i.id as string;
    const current = await getNote(userId, id);
    return updateNote(userId, id, {
      title: (i.title as string) ?? current.title,
      desc: (i.desc as string) ?? current.desc,
      tags: (i.tags as string[]) ?? current.tags,
      priority: (i.priority as Priority) ?? current.priority,
      content: (i.content as string) ?? current.content,
      images: current.images,
      changeNote: i.changeNote as string | undefined,
    });
  },
};

const deleteNoteTool: McpTool = {
  name: 'delete_note',
  description:
    'Xoá vĩnh viễn một ghi chú cùng toàn bộ phiên bản, bình luận và lịch sử trắc nghiệm.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => {
    await deleteNote(userId, (input as { id: string }).id);
    return { ok: true };
  },
};

const listTagsTool: McpTool = {
  name: 'list_tags',
  description: 'Liệt kê mọi thẻ của người dùng kèm số ghi chú, nhiều nhất trước.',
  inputSchema: z.object({}),
  run: async (userId) => ({ tags: await listTags(userId) }),
};

const createQuizTool: McpTool = {
  name: 'create_quiz',
  description:
    'Sinh bộ câu hỏi trắc nghiệm từ nội dung ghi chú và lưu vào lịch sử. Dùng Gemini nếu có API key, nếu không thì sinh offline từ chính nội dung ghi chú. Điểm ghi nhận là 0 vì chưa ai làm bài.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => {
    const id = (input as { id: string }).id;
    // generateQuiz throws HttpError(422, 'NOT_ENOUGH_CONTENT') when the note
    // has nothing to build questions from; callTool surfaces it as a tool error.
    const { questions, source } = await generateQuiz(userId, id);
    const { quiz } = await addQuizRecord(userId, id, {
      score: 0,
      total: questions.length,
      source,
      picks: questions.map(() => null),
      questions,
    });
    return { quiz, source };
  },
};

const listQuizzesTool: McpTool = {
  name: 'list_quizzes',
  description: 'Liệt kê lịch sử trắc nghiệm của một ghi chú, mới nhất trước.',
  inputSchema: z.object(IdShape),
  run: async (userId, input) => ({
    quizzes: (await getNote(userId, (input as { id: string }).id)).quizzes,
  }),
};

/** Thứ tự đúng theo SPEC §2.4. */
export const TOOLS: readonly McpTool[] = [
  listNotesTool,
  searchNotesTool,
  getNoteTool,
  createNoteTool,
  updateNoteTool,
  deleteNoteTool,
  listTagsTool,
  createQuizTool,
  listQuizzesTool,
];

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function callTool(name: string, userId: string, rawInput: unknown): Promise<unknown> {
  const tool = findTool(name);
  if (!tool) throw new HttpError(404, 'UNKNOWN_TOOL', `Không có tool tên "${name}".`);
  const input = tool.inputSchema.parse(rawInput ?? {});
  return tool.run(userId, input);
}
