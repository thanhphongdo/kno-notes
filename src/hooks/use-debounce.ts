'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Coalesce rapid calls into one, `ms` after the last of them.
 *
 * The returned function keeps a stable identity for a given `ms` so it can sit
 * in a dependency array, and always invokes the most recent `fn` — a pending
 * timer that fires after a re-render must not call a stale closure. A pending
 * call is cancelled on unmount.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current(...args);
      }, ms);
    },
    [ms],
  );
}
