import { z } from 'zod';
import { createApiKey, listApiKeys } from '@/lib/auth/api-keys';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ name: z.string().min(1).max(80) });

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { keys: await listApiKeys(user.id) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { name } = Body.parse(await req.json());
    // `key` is the ONLY time the plaintext is ever returned.
    return createApiKey(user.id, name);
  });
}
