import { PrefsSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { getPrefs, updatePrefs } from '@/lib/services/prefs';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { prefs: await getPrefs(user.id) };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const patch = PrefsSchema.parse(await req.json());
    return { prefs: await updatePrefs(user.id, patch) };
  });
}
