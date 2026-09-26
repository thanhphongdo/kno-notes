import { clearSessionCookie } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}
