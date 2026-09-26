import { requireBearer } from '@/lib/api/bearer';
import { handle } from '@/lib/http';
import { listTags } from '@/lib/services/tags';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return { tags: await listTags(user.id) };
  });
}
