'use client';

import { useEffect, useState } from 'react';

/** The app's ONE breakpoint. `window.innerWidth < 820` is mobile. */
export const MOBILE_BREAKPOINT = 820;

export interface UseIsMobileOptions {
  /**
   * Answer from `window.innerWidth` during the *first* render instead of
   * waiting for the effect.
   *
   * Only for a component that is mounted by an interaction and therefore never
   * takes part in hydration — an overlay opened from a click, say. Such a
   * component has no server HTML to disagree with, and the default's one-render
   * lag is visible in it as a flash of the desktop layout.
   *
   * Anything that renders on first paint must leave this off.
   */
  immediate?: boolean;
}

/**
 * SSR-safe: returns false on the server and on the very first client render, then
 * syncs in an effect so hydration never mismatches.
 */
export function useIsMobile({ immediate = false }: UseIsMobileOptions = {}): boolean {
  const [isMobile, setIsMobile] = useState(
    () => immediate && typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}
