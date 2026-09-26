import { requireUser } from '@/lib/auth/session';
import { handle, HttpError } from '@/lib/http';
import { restoreVersion } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; v: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id, v } = await ctx.params;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError(400, 'INVALID_INPUT', 'Số phiên bản không hợp lệ.');
    }
    return restoreVersion(user.id, id, n);
  });
}
