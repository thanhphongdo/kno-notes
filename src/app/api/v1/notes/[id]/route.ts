import { requireBearer } from '@/lib/api/bearer';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { deleteNote, getNote, updateNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return { note: await getNote(user.id, id) };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return updateNote(user.id, id, NoteWriteSchema.parse(await req.json()));
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    await deleteNote(user.id, id);
    return { ok: true };
  });
}
