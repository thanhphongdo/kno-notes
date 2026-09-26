import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { dashboardPath } from '@/lib/nav/paths';

/** The inverse of the `(app)` guard: a signed-in visitor has nothing to do here. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session) redirect(dashboardPath());

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-24">{children}</div>
  );
}
