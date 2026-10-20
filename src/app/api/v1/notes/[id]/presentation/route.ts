import { requireBearer } from '@/lib/api/bearer';
import { PresentationBodySchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { getNote, setPresentation } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Bộ slide trình chiếu của một ghi chú.
 *
 * Tách khỏi `PATCH /notes/{id}` vì cùng lý do như `questions`: tác nhân AI
 * sinh slide không phải gửi lại toàn bộ nội dung bài, mà `PATCH` là
 * thay-toàn-phần nên gửi thiếu một trường là mất trường đó.
 */
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const note = await getNote(user.id, id);
    return { presentation: note.presentation ?? null };
  });
}

/** Thay toàn bộ bộ slide. Gửi `null` để xoá. KHÔNG tạo phiên bản mới. */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const { presentation } = PresentationBodySchema.parse(await req.json());
    const { slideCount } = await setPresentation(user.id, id, presentation);
    return { ok: true, slideCount };
  });
}
