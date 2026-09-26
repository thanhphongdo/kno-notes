import { HighlightSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { saveHighlights } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { content } = HighlightSchema.parse(await req.json());
    const { ok, contentSha } = await saveHighlights(user.id, id, content);
    // part-0 §3.5: the route returns only { ok, contentSha }, not the whole note.
    return { ok, contentSha };
  });
}
