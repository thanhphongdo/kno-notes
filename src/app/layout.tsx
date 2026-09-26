import type { CSSProperties, ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ThemeScript } from '@/components/ui';
import { AppProviders } from '@/components/providers/app-providers';
import { RegisterServiceWorker } from '@/components/features/pwa/register-service-worker';
import { getSession } from '@/lib/auth/session';
import { fontVariables } from '@/lib/fonts';
import { DEFAULT_PREFS, PREFS_COOKIE, parsePrefsCookie, toClientPrefs, type ClientPrefs } from '@/lib/prefs';
import { getPrefs } from '@/lib/services/prefs';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Kno-Notes';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Sổ tay kiến thức cá nhân.',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1112' },
  ],
};

/**
 * Postgres owns prefs; the `kn_prefs` cookie is the copy that is readable
 * before any query resolves. Reading the row keeps the cookie honest across
 * devices, and a database that is down must still render `/login`.
 */
async function resolvePrefs(userId: string | null, cookiePrefs: ClientPrefs): Promise<ClientPrefs> {
  if (!userId) return cookiePrefs;
  try {
    return toClientPrefs(await getPrefs(userId));
  } catch {
    return cookiePrefs;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const cookiePrefs = parsePrefsCookie(jar.get(PREFS_COOKIE)?.value ?? undefined);
  const session = await getSession();
  const prefs = await resolvePrefs(session?.id ?? null, cookiePrefs);

  return (
    <html
      lang="vi"
      data-theme={prefs.theme}
      data-accent="teal"
      data-sidebar={prefs.sidebarCollapsed ? 'collapsed' : 'expanded'}
      className={fontVariables}
      style={{ '--fs': `${prefs.fontSize ?? DEFAULT_PREFS.fontSize}px` } as CSSProperties}
      suppressHydrationWarning
    >
      <head>
        {/*
          Runs before first paint and re-asserts the attributes above from the
          value the browser last saw. It matters when this HTML came from a
          back/forward cache or another tab changed the theme in between.
        */}
        <ThemeScript />
      </head>
      <body>
        <AppProviders initialPrefs={prefs} signedIn={Boolean(session)}>
          {children}
        </AppProviders>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
