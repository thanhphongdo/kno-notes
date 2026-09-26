'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Backoff for the "did the URL actually change?" checks, in ms. Escalating
 * rather than fixed because the drop rate rises with machine load, and a
 * loaded machine also needs longer for a successful navigation to land.
 */
const VERIFY_BACKOFF_MS = [100, 200, 400, 800, 1200] as const;

export type NavigateMode = 'push' | 'replace';

export interface NavigateOptions {
  /**
   * Scroll to the top on arrival. Dashboard filter controls keep the reading
   * position (`false`); sidebar navigation starts a new listing, so it scrolls
   * like the prototype's `goDash` does.
   */
  scroll?: boolean;
}

/**
 * Navigation that verifies it happened.
 *
 * Next commits a navigation inside a React transition. When that transition is
 * opened by an event handler that also queued ordinary state updates, it is
 * sometimes dropped outright: `router.push`/`router.replace` is called with the
 * correct href and `history.pushState`/`replaceState` never fires. A successful
 * navigation lands in 9–28 ms; a dropped one never lands at all, so this is not
 * latency and waiting longer does not help.
 *
 * Reproduced in chromium against a production build at a rate that moves with
 * machine load (20–73%). Ruled out as causes: `<Link>` prefetching, the
 * debounced prefs write, `flushSync`, requesting the navigation from an effect,
 * wrapping everything in one `startTransition`, and hydration timing. The one
 * control that never fails is a real `<Link>`, which takes no state update
 * first — so the trigger is the state-update-then-navigate shape, not the
 * router itself.
 *
 * Rather than leave a user-facing failure in place, re-issue the navigation if
 * the URL has not changed shortly after. Re-issuing is safe: once the URL
 * matches the target the check stops, and an in-flight navigation that lands
 * between attempts also stops it.
 */
export function useVerifiedNavigate(): (href: string, mode: NavigateMode, options?: NavigateOptions) => void {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  return useCallback(
    (href: string, mode: NavigateMode, options?: NavigateOptions) => {
      const opts = { scroll: options?.scroll ?? false };
      const go = () =>
        mode === 'replace' ? router.replace(href, opts) : router.push(href, opts);

      go();
      if (typeof window === 'undefined') return;

      let step = 0;
      const verify = () => {
        if (window.location.pathname + window.location.search === href) return;
        const delay = VERIFY_BACKOFF_MS[step];
        step += 1;
        if (delay === undefined) {
          // Every soft retry was dropped too. A full page load always works —
          // it costs a round trip, but silently doing nothing is far worse
          // than navigating slowly.
          window.location.assign(href);
          return;
        }
        go();
        timers.current.push(setTimeout(verify, delay));
      };
      timers.current.push(setTimeout(verify, VERIFY_BACKOFF_MS[0]));
    },
    [router],
  );
}
