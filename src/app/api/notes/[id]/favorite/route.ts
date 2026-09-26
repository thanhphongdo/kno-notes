import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { toggleFavorite } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return toggleFavorite(user.id, id);
  });
}
