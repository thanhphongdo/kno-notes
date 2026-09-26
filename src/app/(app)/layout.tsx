import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { InstallPrompt } from '@/components/features/pwa/install-prompt';
import { UpdatePrompt } from '@/components/features/pwa/update-prompt';
import { OfflineProvider } from '@/components/providers/offline-provider';
import { ShellClient } from '@/components/features/shell/shell-client';
import { getShellNavData } from '@/components/features/shell/shell-data';
import { getSession } from '@/lib/auth/session';
import { loginPath } from '@/lib/nav/paths';

/**
 * The session guard for everything behind the cookie, and the only place the
 * sidebar's data is fetched. It makes no assumption about which routes sit
 * underneath it — dashboard, notes and settings all mount the same chrome.
 *
 * `ShellClient` reads the query string, so it is wrapped in `Suspense`: that is
 * what lets a child page stream instead of blocking on `useSearchParams`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect(loginPath());

  const data = await getShellNavData(session);

  return (
    <Suspense>
      <OfflineProvider>
        <ShellClient data={data}>{children}</ShellClient>
        <InstallPrompt />
        <UpdatePrompt />
      </OfflineProvider>
    </Suspense>
  );
}
