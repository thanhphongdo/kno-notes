import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { deleteComment } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commentId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id, commentId } = await ctx.params;
    return deleteComment(user.id, id, commentId);
  });
}
