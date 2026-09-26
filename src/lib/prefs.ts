/**
 * The `kn_prefs` cookie — a readable mirror of `user_prefs` in Postgres.
 *
 * Postgres is the source of truth, but the *first paint* must already carry the
 * right theme and `--fs`, so every write also lands in a non-httpOnly cookie
 * that the root layout reads with `cookies()`. The cookie is only ever a cache:
 * a full page load for a signed-in user overwrites it from the database.
 *
 * Nothing here may throw — a hand-edited cookie must degrade to the defaults.
 */
import { clampFontSize, FS_DEFAULT, type Theme } from '@/lib/theme';
import type { UserPrefs } from '@/lib/types';

export const PREFS_COOKIE = 'kn_prefs';
export const PREFS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const MAX_RECENT_SEARCHES = 5;

/** Everything in `UserPrefs` except the row key. */
export type ClientPrefs = Omit<UserPrefs, 'userId'>;

export const DEFAULT_PREFS: ClientPrefs = {
  theme: 'light',
  fontSize: FS_DEFAULT,
  view: 'grid',
  sidebarCollapsed: false,
  recentSearches: [],
};

/** Unique, newest first, at most 5 (contracts §4). */
export function normalizeRecent(list: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const term = item.trim();
    if (!term || out.includes(term)) continue;
    out.push(term);
    if (out.length === MAX_RECENT_SEARCHES) break;
  }
  return out;
}

/** Record a search term: newest first, unique, capped. Blank terms are ignored. */
export function pushRecent(list: readonly string[], raw: string): string[] {
  const term = raw.trim();
  if (!term) return normalizeRecent(list);
  return normalizeRecent([term, ...list]);
}

function readPrefs(o: Record<string, unknown>): ClientPrefs {
  const theme: Theme = o.theme === 'dark' ? 'dark' : 'light';
  return {
    theme,
    fontSize: typeof o.fontSize === 'number' ? clampFontSize(o.fontSize) : DEFAULT_PREFS.fontSize,
    view: o.view === 'list' ? 'list' : 'grid',
    sidebarCollapsed:
      typeof o.sidebarCollapsed === 'boolean' ? o.sidebarCollapsed : DEFAULT_PREFS.sidebarCollapsed,
    recentSearches: Array.isArray(o.recentSearches) ? normalizeRecent(o.recentSearches) : [],
  };
}

/** Never throws: any malformed value falls back to `DEFAULT_PREFS`, field by field. */
export function parsePrefsCookie(raw: string | undefined): ClientPrefs {
  if (!raw) return DEFAULT_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return DEFAULT_PREFS;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_PREFS;
  return readPrefs(parsed as Record<string, unknown>);
}

export function serializePrefsCookie(prefs: ClientPrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** Browser-side mirror. A no-op on the server and when cookies are blocked. */
export function writePrefsCookie(prefs: ClientPrefs): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie =
      `${PREFS_COOKIE}=${serializePrefsCookie(prefs)}` +
      `; path=/; max-age=${PREFS_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* prefs are best-effort */
  }
}

/** Drop the row key and re-normalise whatever the database handed back. */
export function toClientPrefs(row: UserPrefs): ClientPrefs {
  return readPrefs({ ...row });
}
