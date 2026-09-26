'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { applyPrefs, clampFontSize, PREFS_KEY, type Accent, type Theme } from '@/lib/theme';
import { usePrefs } from './prefs-provider';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * `ThemeScript` (design system) reads this key before first paint. Mirroring
 * every change into it is what keeps the pre-paint pass and the server-rendered
 * `<html>` attributes in agreement — otherwise the script would repaint the
 * page to the stale value on the very next navigation.
 */
function mirrorToThemeScriptStorage(theme: Theme, fontSize: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    let accent: Accent | undefined;
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const stored: unknown = JSON.parse(raw);
      if (stored && typeof stored === 'object') {
        const candidate = (stored as { accent?: unknown }).accent;
        if (candidate === 'indigo' || candidate === 'plum' || candidate === 'teal') accent = candidate;
      }
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, accent: accent ?? 'teal', fontSize }));
  } catch {
    /* private mode or blocked storage — the cookie still carries the value */
  }
}

/**
 * Projects prefs onto `<html>`. The server already rendered the same
 * attributes, so this is a no-op on first paint and the single place that
 * reacts to a later change.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs, setPrefs } = usePrefs();
  const { theme, fontSize, sidebarCollapsed } = prefs;

  useEffect(() => {
    applyPrefs({ theme, fontSize });
    document.documentElement.dataset.sidebar = sidebarCollapsed ? 'collapsed' : 'expanded';
    mirrorToThemeScriptStorage(theme, fontSize);
  }, [theme, fontSize, sidebarCollapsed]);

  const setTheme = useCallback((next: Theme) => setPrefs({ theme: next }), [setPrefs]);
  const setFontSize = useCallback(
    (next: number) => setPrefs({ fontSize: clampFontSize(next) }),
    [setPrefs],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, fontSize, setFontSize }),
    [theme, setTheme, fontSize, setFontSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
