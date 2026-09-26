/**
 * The service worker's cache policy — the single, unit-tested specification of
 * what Kno-Notes is allowed to store on disk.
 *
 * ── Why this is security-critical (contracts §4) ─────────────────────────────
 * Every page under `(app)` is authenticated HTML rendered for one specific
 * `userId`. A Cache Storage entry is shared by every visitor to the origin on
 * that device and outlives the session cookie. Caching a navigation response
 * would therefore hand a logged-out visitor — or the next person to use the
 * laptop — another user's notes, straight out of `caches`, with no request to
 * the server and no way for the server to say no.
 *
 * So the rules are deliberately blunt:
 *   • navigations   → network-first, response NEVER stored; on failure serve
 *                     the precached `/offline` page
 *   • /api/*        → network-only, always, with no exception (including
 *                     /api/images/*, whose responses are user-scoped too)
 *   • /_next/data/* → network-only: those payloads carry note content
 *   • build assets, icons, the manifest, the favicon → stale-while-revalidate
 *   • everything else (cross-origin, non-GET, unknown paths) → network-only
 *
 * `mayCache()` is the allowlist those rules reduce to, and `public/sw.js`
 * re-implements both by hand because a raw-served worker cannot import from
 * `src/`. Any change must be made in both files.
 */

export type CacheStrategy = 'network-only' | 'network-first-offline-fallback' | 'stale-while-revalidate';

export const OFFLINE_URL = '/offline';

/** Path prefixes that are safe to cache. Matched on a path-segment boundary. */
export const CACHEABLE_PREFIXES = ['/_next/static/', '/icons/'] as const;

/** Exact paths that are safe to cache. */
export const CACHEABLE_PATHS = [OFFLINE_URL, '/manifest.webmanifest', '/favicon.ico'] as const;

/** Precached at install time: the offline page plus the manifest and icons. */
export const PRECACHE_URLS: readonly string[] = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
];

/**
 * The allowlist. `true` means "this response may be written to Cache Storage".
 * Anything not named here is a hard no — the default is never to cache.
 */
export function mayCache(pathname: string): boolean {
  if (CACHEABLE_PATHS.includes(pathname as (typeof CACHEABLE_PATHS)[number])) return true;
  return CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export interface RequestShape {
  method: string;
  /** `Request.mode` — `'navigate'` marks a document load. */
  mode: string;
  url: string;
  /** `self.location.origin` in the worker. */
  origin: string;
}

export function strategyFor({ method, mode, url, origin }: RequestShape): CacheStrategy {
  if (method !== 'GET') return 'network-only';

  let pathname: string;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return 'network-only';
    pathname = parsed.pathname;
  } catch {
    return 'network-only';
  }

  // A document load is never stored, only backstopped by /offline.
  if (mode === 'navigate') return 'network-first-offline-fallback';

  // Blunt and first: no API response ever enters the cache.
  if (pathname.startsWith('/api/')) return 'network-only';

  return mayCache(pathname) ? 'stale-while-revalidate' : 'network-only';
}
