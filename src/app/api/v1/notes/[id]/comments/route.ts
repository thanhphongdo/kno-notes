import { requireBearer } from '@/lib/api/bearer';
import { CommentSchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { addComment } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    const { text } = CommentSchema.parse(await req.json());
    return addComment(user, id, text);
  });
}
