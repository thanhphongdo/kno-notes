import { PresentationBodySchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { getNote, setPresentation } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Bản dùng cookie phiên cho UI; bản `/api/v1` cùng tên dành cho tác nhân AI. */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const note = await getNote(user.id, id);
    return { presentation: note.presentation ?? null };
  });
}

/** Thay toàn bộ bộ slide. Gửi `null` để xoá. KHÔNG tạo phiên bản mới. */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { presentation } = PresentationBodySchema.parse(await req.json());
    const { slideCount } = await setPresentation(user.id, id, presentation);
    return { ok: true, slideCount };
  });
}
