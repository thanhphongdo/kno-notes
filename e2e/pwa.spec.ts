import { test, expect, STORAGE_STATE } from './fixtures/auth';

/**
 * PWA surface (SPEC §1.4 item 25) and the privacy rule that comes with it.
 *
 * The security half is the point of this file. Contracts §4 forbids the
 * service worker from ever persisting an authenticated navigation or an
 * `/api/*` response: a Cache Storage entry is shared by every profile on the
 * origin and outlives the session cookie, so one cached `/notes/n1` would hand
 * the next visitor somebody else's note with no request to the server at all.
 * The tests below do not read the worker's source and trust it — they drive a
 * real signed-in session, let the worker install, and then enumerate what
 * actually landed in `caches`.
 */

/** Everything the worker is allowed to keep (`public/sw.js`, CACHEABLE_*). */
const ALLOWED_EXACT = ['/offline', '/manifest.webmanifest', '/favicon.ico'];
const ALLOWED_PREFIXES = ['/_next/static/', '/icons/'];

function isAllowed(pathname: string): boolean {
  return ALLOWED_EXACT.includes(pathname) || ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Every URL currently stored in Cache Storage, across every cache. */
async function cachedUrls(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const out: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) out.push(request.url);
    }
    return out;
  });
}

test.describe('manifest', () => {
  test('phục vụ JSON hợp lệ với tên, theme color và icon tải được', async ({ page }) => {
    const res = await page.request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/manifest\+json|application\/json/);

    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      scope: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };

    // SPEC §0: the prototype's "Sổ Lâm Sàng" is gone everywhere it can be seen.
    expect(manifest.name).toBe('Kno-Notes');
    expect(manifest.short_name).toBe('Kno-Notes');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    // Design Spec §01: --accent (light) and --bg (light).
    expect(manifest.theme_color).toBe('#17756b');
    expect(manifest.background_color).toBe('#f6f6f3');

    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));

    for (const icon of manifest.icons) {
      const iconRes = await page.request.get(icon.src);
      expect(iconRes.status(), `${icon.src} must be reachable`).toBe(200);
      expect(iconRes.headers()['content-type']).toContain('image/');
    }
  });

  test('<head> khai báo manifest, apple-touch-icon và theme-color', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      /apple-touch-icon\.png/,
    );
    expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0);
  });
});

test.describe('service worker', () => {
  test('/sw.js phục vụ kèm Service-Worker-Allowed', async ({ page }) => {
    const res = await page.request.get('/sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['service-worker-allowed']).toBe('/');
    expect(res.headers()['content-type']).toContain('javascript');
    expect(await res.text()).toContain("addEventListener('fetch'");
  });

  test('/offline render được khi không có phiên đăng nhập', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto('/offline');
      await expect(page.getByText('Đang ngoại tuyến', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('không bao giờ lưu trang đã đăng nhập hay /api vào cache (contracts §4)', async ({ browser }) => {
    // A fresh context so Cache Storage starts empty and every entry observed
    // below was written by this run's worker.
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    try {
      const page = await context.newPage();

      await page.goto('/');
      // The worker registers on `load` and precaches during `install`.
      await page.waitForFunction(async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        return Boolean(reg?.active);
      }, undefined, { timeout: 20_000 });

      // Browse like a signed-in user: a dashboard navigation, a note and an
      // internal API call. None of the three may be persisted.
      await page.goto('/?view=list');
      await page.goto('/notes/n1');
      await expect(page.locator('[data-prose]')).toBeVisible();
      // An in-page `fetch` rather than `page.request`: Playwright's API
      // request context refuses to send the `Secure` session cookie over
      // plain http, so only the browser itself can make an authenticated call.
      expect(await page.evaluate(async () => (await fetch('/api/tags')).status)).toBe(200);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const urls = await cachedUrls(page);
      const paths = urls.map((u) => new URL(u).pathname);

      // Positive control: the worker really did cache something, so an empty
      // Cache Storage can never make this test pass by accident.
      expect(paths).toContain('/offline');
      expect(paths.some((p) => p.startsWith('/icons/'))).toBe(true);

      // The forbidden entries, named explicitly.
      expect(paths).not.toContain('/');
      expect(paths).not.toContain('/notes/n1');
      expect(paths).not.toContain('/api/notes');
      expect(paths.filter((p) => p.startsWith('/api/'))).toEqual([]);

      // …and the general rule, so a future route cannot slip through.
      expect(paths.filter((p) => !isAllowed(p))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
