'use client';

import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import {
  DEFAULT_PREFS, pushRecent, writePrefsCookie, type ClientPrefs,
} from '@/lib/prefs';

/** One PATCH per burst of changes — dragging the font-size slider must not spam. */
export const PREFS_SYNC_DEBOUNCE_MS = 500;

export interface PrefsContextValue {
  prefs: ClientPrefs;
  setPrefs: (patch: Partial<ClientPrefs>) => void;
  pushRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export interface PrefsProviderProps {
  /** Server-rendered value: Postgres when signed in, the `kn_prefs` cookie otherwise. */
  initial?: ClientPrefs;
  /** Only a signed-in visitor has a `user_prefs` row to write to. */
  sync?: boolean;
  children: ReactNode;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Prefs are optimistic everywhere: state changes now, the cookie is mirrored
 * synchronously so the next server render agrees, and Postgres catches up on a
 * debounced `PATCH /api/prefs`. A failed PATCH is swallowed — the cookie still
 * holds the value and the next successful write reconciles it.
 */
export function PrefsProvider({ initial = DEFAULT_PREFS, sync = false, children }: PrefsProviderProps) {
  const [prefs, setState] = useState<ClientPrefs>(initial);
  const pending = useRef<Partial<ClientPrefs>>({});

  const flush = useDebouncedCallback(() => {
    const patch = pending.current;
    pending.current = {};
    if (!sync || Object.keys(patch).length === 0) return;
    void fetch('/api/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {
      /* best-effort: the cookie already carries the value */
    });
  }, PREFS_SYNC_DEBOUNCE_MS);

  const commit = useCallback(
    (patch: Partial<ClientPrefs>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        writePrefsCookie(next);
        return next;
      });
      pending.current = { ...pending.current, ...patch };
      flush();
    },
    [flush],
  );

  const pushRecentSearch = useCallback(
    (term: string) => {
      setState((prev) => {
        const recentSearches = pushRecent(prev.recentSearches, term);
        if (sameList(recentSearches, prev.recentSearches)) return prev;
        const next = { ...prev, recentSearches };
        writePrefsCookie(next);
        pending.current = { ...pending.current, recentSearches };
        flush();
        return next;
      });
    },
    [flush],
  );

  const clearRecentSearches = useCallback(() => commit({ recentSearches: [] }), [commit]);

  const value = useMemo<PrefsContextValue>(
    () => ({ prefs, setPrefs: commit, pushRecentSearch, clearRecentSearches }),
    [prefs, commit, pushRecentSearch, clearRecentSearches],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
