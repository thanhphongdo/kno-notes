'use client';

import { useEffect, useState } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `true` when the reader has asked the system for less movement.
 *
 * SSR-safe in the same way as `useIsMobile()`: `false` on the server and on the
 * first client render, then synced in an effect so hydration never mismatches.
 * Animations therefore have to be *additive* — the component must look right
 * with the transition switched off.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}
