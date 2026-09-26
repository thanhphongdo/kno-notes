import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { listTags } from '@/lib/services/tags';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { tags: await listTags(user.id) };
  });
}
