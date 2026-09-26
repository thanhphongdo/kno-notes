/*
 * Kno-Notes service worker.
 *
 * ── SECURITY (contracts §4) ─────────────────────────────────────────────────
 * Authenticated HTML and every `/api/*` response are NEVER stored. Every page
 * under `(app)` is rendered for one specific user; a Cache Storage entry is
 * shared by everyone who uses this origin on this device and outlives the
 * session cookie, so caching one would hand a logged-out visitor — or the next
 * person on the same laptop — another user's notes with no request to the
 * server at all.
 *
 * What may be cached:
 *   /offline, /manifest.webmanifest, /favicon.ico, /_next/static/*, /icons/*
 * Everything else is passed straight through to the network.
 *
 * `mayCache()` / `strategyFor()` below are a hand-copy of
 * `src/lib/pwa/sw-cache-policy.ts`, which is the tested specification — this
 * file is served raw and cannot import from `src/`. Change both together.
 */

/*
 * Phiên bản lấy từ CHÍNH URL của script: trang đăng ký `/sw.js?v=<build id>`
 * (`src/lib/pwa/build-id.ts`). Nhờ vậy mỗi lần deploy là một bộ cache mới và
 * `activate` bên dưới dọn sạch bộ cũ. Không có query — bản cài từ trước khi có
 * cơ chế này — thì rơi về 'kn-v1' và sẽ bị thay ngay ở lần đăng ký kế tiếp.
 */
function versionFromUrl() {
  try {
    return 'kn-' + (new URL(self.location.href).searchParams.get('v') || 'v1');
  } catch {
    return 'kn-v1';
  }
}

const VERSION = versionFromUrl();
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

const CACHEABLE_PATHS = [OFFLINE_URL, '/manifest.webmanifest', '/favicon.ico'];
const CACHEABLE_PREFIXES = ['/_next/static/', '/icons/'];

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
];

/** The allowlist. Anything not named here is never written to Cache Storage. */
function mayCache(pathname) {
  if (CACHEABLE_PATHS.includes(pathname)) return true;
  return CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function strategyFor(request) {
  if (request.method !== 'GET') return 'network-only';

  let pathname;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return 'network-only';
    pathname = url.pathname;
  } catch {
    return 'network-only';
  }

  if (request.mode === 'navigate') return 'network-first-offline-fallback';
  if (pathname.startsWith('/api/')) return 'network-only';
  return mayCache(pathname) ? 'stale-while-revalidate' : 'network-only';
}

/**
 * Trang /offline có bundle JavaScript riêng, và bundle đó KHÔNG BAO GIỜ được
 * tải trong lúc người dùng còn online — nên nó không thể lọt vào cache theo
 * kiểu stale-while-revalidate như các chunk khác. Thiếu nó, lúc mất mạng
 * trang chỉ hiện được phần tĩnh còn trình đọc ngoại tuyến không chạy.
 *
 * Nên: đọc chính HTML của /offline và nạp trước những `/_next/static/*` mà nó
 * tham chiếu. Tên file có hash nên danh sách này tự đúng theo từng bản build.
 */
async function precacheOfflineAssets() {
  try {
    const res = await fetch(OFFLINE_URL, { cache: 'reload' });
    if (!res.ok) return;
    const html = await res.text();
    const cache = await caches.open(ASSET_CACHE);
    const urls = new Set();
    const re = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
    let match;
    while ((match = re.exec(html)) !== null) urls.add(match[1]);
    await Promise.all([...urls].map((url) => cache.add(url).catch(() => undefined)));
  } catch {
    /* cài đặt vẫn phải thành công dù không nạp trước được gì */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // One `addAll` would abort the whole install if a single URL 404s during
      // a partial deploy, leaving the app with no offline page at all. Add them
      // one at a time and let the misses go.
      await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)));
      await precacheOfflineAssets();
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Network-first for documents; the response is used, never stored.
 *
 * Khi mạng hỏng thì CHUYỂN HƯỚNG tới /offline chứ không trả thân trang đó cho
 * URL đang xin. Trả thân trang là cách cũ, và nó sai: tài liệu nhận được là
 * trang /offline trong khi thanh địa chỉ vẫn là /notes/xyz, nên Next hydrate
 * theo route /notes/xyz, không khớp với HTML máy chủ, rồi dựng thêm một cây
 * DOM thứ hai bên cạnh cây đã có — hai trang chồng lên nhau.
 *
 * Chuyển hướng thì tài liệu và URL khớp nhau, Back vẫn đúng, và lần điều
 * hướng tới chính /offline mới đọc từ cache (nếu không sẽ lặp vô hạn).
 */
async function navigateWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    let pathname = '';
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      /* URL lạ: coi như không phải /offline */
    }
    // `Response.redirect` CHỈ nhận URL tuyệt đối; đưa đường dẫn tương đối vào
    // là nó ném TypeError và điều hướng chết hẳn thay vì hiện trang ngoại tuyến.
    if (pathname !== OFFLINE_URL) {
      return Response.redirect(new URL(OFFLINE_URL, self.location.origin).href, 302);
    }

    const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return (
      cached ||
      new Response('<!doctype html><meta charset="utf-8"><title>Ngoại tuyến</title><p>Không có kết nối mạng.</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function staleWhileRevalidate(request) {
  const url = new URL(request.url);
  // Belt and braces: the strategy already checked, check again before writing.
  if (!mayCache(url.pathname)) return fetch(request);

  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request);
  if (strategy === 'network-only') return; // untouched: the browser handles it
  if (strategy === 'stale-while-revalidate') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  event.respondWith(navigateWithOfflineFallback(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
