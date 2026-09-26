'use client';

import { useEffect, useState } from 'react';

/** The app's ONE breakpoint. `window.innerWidth < 820` is mobile. */
export const MOBILE_BREAKPOINT = 820;

/**
 * SSR-safe: returns false on the server and on the very first client render, then
 * syncs in an effect so hydration never mismatches.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}
