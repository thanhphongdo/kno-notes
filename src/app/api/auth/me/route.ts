import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  return handle(async () => ({ user: await requireUser() }));
}
