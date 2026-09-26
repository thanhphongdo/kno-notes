import { requireBearer } from '@/lib/api/bearer';
import { QuestionBankSchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { getNote, setQuestions } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Bộ câu hỏi soạn sẵn của một ghi chú.
 *
 * Tách khỏi `PATCH /notes/{id}` để một tác nhân AI soạn câu hỏi không phải
 * gửi lại toàn bộ nội dung bài — `PATCH` là thay-toàn-phần, nên gửi thiếu một
 * trường là mất trường đó.
 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const note = await getNote(user.id, id);
    return { questions: note.questions ?? [] };
  });
}

/** Thay toàn bộ bộ câu hỏi. Gửi mảng rỗng để xoá. KHÔNG tạo phiên bản mới. */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const { questions } = QuestionBankSchema.parse(await req.json());
    const { count } = await setQuestions(user.id, id, questions);
    return { ok: true, count };
  });
}
