import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiKeysClient } from '@/components/features/api-keys/api-keys-client';
import { getSession } from '@/lib/auth';
import { loginPath } from '@/lib/nav/paths';

export const metadata: Metadata = { title: 'API key' };
export const dynamic = 'force-dynamic';

/**
 * The origin is read from the request rather than hard-coded, so the wiring
 * snippets on the page work verbatim against a local dev server as well as
 * against the deployed app.
 */
export default async function ApiKeysPage() {
  const session = await getSession();
  if (!session) redirect(loginPath());

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  return <ApiKeysClient baseUrl={`${proto}://${host}`} />;
}
