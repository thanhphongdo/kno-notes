'use client';

import type { ReactNode } from 'react';
import { ToastProvider, TooltipRoot } from '@/components/ui';
import type { ClientPrefs } from '@/lib/prefs';
import { PrefsProvider } from './prefs-provider';
import { ThemeProvider } from './theme-provider';

export interface AppProvidersProps {
  /** Server-rendered prefs: Postgres when signed in, the `kn_prefs` cookie otherwise. */
  initialPrefs: ClientPrefs;
  /** Whether there is a `user_prefs` row to sync to. */
  signedIn: boolean;
  children: ReactNode;
}

/**
 * The whole client context stack, mounted once in the root layout so that
 * `useToast()` — which throws outside its provider — is available to every
 * feature component, including the ones on `/login`.
 *
 * `ToastProvider` and its `Toaster` viewport belong to the design system
 * (contracts §2.1); this only composes them.
 */
export function AppProviders({ initialPrefs, signedIn, children }: AppProvidersProps) {
  return (
    <TooltipRoot>
      <PrefsProvider initial={initialPrefs} sync={signedIn}>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </PrefsProvider>
    </TooltipRoot>
  );
}
