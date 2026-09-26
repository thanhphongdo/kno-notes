import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { buildSearchDocs } from '@/lib/services/search-index';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await buildSearchDocs(user.id);
    // `no-store` is deliberate: this is one user's entire corpus, so it must
    // never land in a shared cache. The client keeps its own copy in IndexedDB
    // keyed by contentSha anyway.
    return Response.json(
      { userId: user.id, items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
