import { revokeApiKey } from '@/lib/auth/api-keys';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await revokeApiKey(user.id, id);
    return { ok: true };
  });
}
