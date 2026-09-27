import { originOf, protectedResourceMetadata } from '@/lib/auth/oauth';
import { json, preflight } from '@/lib/auth/oauth-http';

export const runtime = 'nodejs';

/**
 * RFC 9728. Phục vụ tại `/.well-known/oauth-protected-resource` qua rewrite
 * trong `next.config.ts` — thư mục bắt đầu bằng dấu chấm thì App Router không
 * nhận làm route.
 */
export const GET = (req: Request) => json(protectedResourceMetadata(originOf(req)));
export const OPTIONS = preflight;
