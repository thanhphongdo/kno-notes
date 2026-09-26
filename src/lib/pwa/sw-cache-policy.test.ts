import { describe, it, expect } from 'vitest';
import { strategyFor, mayCache, PRECACHE_URLS, OFFLINE_URL } from './sw-cache-policy';

const origin = 'https://kno-notes.vercel.app';
const at = (url: string, over: Partial<{ method: string; mode: string }> = {}) =>
  strategyFor({ method: 'GET', mode: 'cors', url, origin, ...over });

describe('strategyFor — navigations', () => {
  it('never caches an authenticated page, but falls back to /offline', () => {
    expect(at(`${origin}/`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
    expect(at(`${origin}/notes/x`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
    expect(at(`${origin}/notes/n1/edit`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
    expect(at(`${origin}/settings/api-keys`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
  });

  it('treats /offline itself as a navigation', () => {
    expect(at(`${origin}/offline`, { mode: 'navigate' })).toBe('network-first-offline-fallback');
  });
});

describe('strategyFor — API', () => {
  it('never caches any API response', () => {
    for (const path of ['/api/notes', '/api/notes/n1', '/api/auth/me', '/api/prefs', '/api/search/index', '/api/mcp', '/api/v1/notes']) {
      expect(at(`${origin}${path}`)).toBe('network-only');
    }
  });

  it('never caches user images either — the path is user-scoped, the response is private', () => {
    expect(at(`${origin}/api/images/u1/img1.png`)).toBe('network-only');
  });
});

describe('strategyFor — static assets', () => {
  it('revalidates build assets in the background', () => {
    expect(at(`${origin}/_next/static/chunks/main.js`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/_next/static/css/app.css`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/icons/icon-192.png`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/manifest.webmanifest`)).toBe('stale-while-revalidate');
    expect(at(`${origin}/favicon.ico`)).toBe('stale-while-revalidate');
  });

  it('does NOT cache /_next/data — those payloads carry note content', () => {
    expect(at(`${origin}/_next/data/build/notes/n1.json`)).toBe('network-only');
  });

  it('does not cache an RSC fetch for a page', () => {
    expect(at(`${origin}/notes/n1?_rsc=abc`)).toBe('network-only');
  });
});

describe('strategyFor — everything else', () => {
  it('leaves cross-origin requests alone', () => {
    expect(at('https://fonts.gstatic.com/x.woff2')).toBe('network-only');
    expect(at('https://huggingface.co/model.onnx')).toBe('network-only');
  });

  it('leaves non-GET requests alone', () => {
    expect(at(`${origin}/_next/static/chunks/main.js`, { method: 'POST' })).toBe('network-only');
    expect(at(`${origin}/`, { method: 'POST', mode: 'navigate' })).toBe('network-only');
  });

  it('is network-only for an unparseable url', () => {
    expect(at('not a url')).toBe('network-only');
  });

  it('matches an origin only on a path boundary', () => {
    expect(at(`${origin}.evil.test/_next/static/x.js`)).toBe('network-only');
  });
});

describe('mayCache — the allowlist', () => {
  it('allows only the offline page, build assets, icons, the manifest and the favicon', () => {
    expect(mayCache('/offline')).toBe(true);
    expect(mayCache('/_next/static/chunks/main.js')).toBe(true);
    expect(mayCache('/icons/icon-512.png')).toBe(true);
    expect(mayCache('/manifest.webmanifest')).toBe(true);
    expect(mayCache('/favicon.ico')).toBe(true);
  });

  it('refuses every authenticated surface', () => {
    for (const path of ['/', '/notes/x', '/notes/n1/edit', '/settings/api-keys', '/login', '/api/notes', '/api/images/u1/a.png', '/_next/data/b/notes/n1.json']) {
      expect(mayCache(path)).toBe(false);
    }
  });

  it('cannot be tricked by a prefix that is not a path segment', () => {
    expect(mayCache('/offline-notes/secret')).toBe(false);
    expect(mayCache('/_next/staticfoo/x.js')).toBe(false);
    expect(mayCache('/iconsx/a.png')).toBe(false);
  });

  it('agrees with strategyFor: anything cacheable is allowlisted', () => {
    const cacheable = ['/offline', '/_next/static/chunks/main.js', '/icons/icon-192.png', '/manifest.webmanifest'];
    for (const path of cacheable) expect(mayCache(path)).toBe(true);
  });
});

describe('PRECACHE_URLS', () => {
  it('precaches the offline page and static assets only', () => {
    expect(PRECACHE_URLS).toContain(OFFLINE_URL);
    for (const url of PRECACHE_URLS) expect(mayCache(url)).toBe(true);
  });

  it('never precaches an app shell route', () => {
    expect(PRECACHE_URLS).not.toContain('/');
    expect(PRECACHE_URLS.some((u) => u.startsWith('/api/'))).toBe(false);
  });
});
