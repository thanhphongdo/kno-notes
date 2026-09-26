'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js` once, after load, in production only.
 *
 * Three deliberate restraints:
 *  • Dev is skipped entirely — an active worker in front of Next's HMR
 *    endpoints makes hot reload flap.
 *  • Registration waits for `load` so it never competes with hydration, and
 *    a rejected registration is swallowed: the PWA layer is optional and must
 *    never take the app down with it.
 *  • Nothing here touches the router. The worker's own fetch handler is
 *    network-first for navigations and never caches them (contracts §4), so
 *    client-side navigation is untouched either way.
 */
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* PWA support is optional */
      });
    };

    if (document.readyState === 'complete') {
      register();
      return () => { cancelled = true; };
    }

    window.addEventListener('load', register, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
