import { authorizationServerMetadata, originOf } from '@/lib/auth/oauth';
import { json, preflight } from '@/lib/auth/oauth-http';

export const runtime = 'nodejs';

/** RFC 8414 — xem chú thích ở `protected-resource/route.ts` về rewrite. */
export const GET = (req: Request) => json(authorizationServerMetadata(originOf(req)));
export const OPTIONS = preflight;
