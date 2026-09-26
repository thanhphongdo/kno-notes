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
 * Khi mạng hỏng thì trả THÂN trang /offline đã precache, cho bất kỳ URL nào.
 *
 * Có một cách nhìn "đúng hơn": chuyển hướng sang /offline để tài liệu và
 * thanh địa chỉ khớp nhau. Đừng làm thế. WebKit xử lý response chuyển hướng
 * do service worker trả cho một điều hướng rất không ổn định, và trên app đã
 * cài ở iPhone nó cho ra màn hình trắng — không lỗi, không chữ, không gì cả.
 * Trả thẳng thân trang là cách đã chạy ổn định, và trang /offline được dựng
 * để hiển thị được dưới bất kỳ URL nào.
 */
async function navigateWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    if (cached) return cached;

    // Chưa kịp precache (lần mở đầu tiên đã mất mạng): ít nhất cũng phải nói
    // được chuyện gì đang xảy ra, thay vì để trình duyệt hiện trang lỗi trắng.
    return new Response(
      '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Đang ngoại tuyến</title>' +
        '<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:10px;background:#f6f6f3;color:#1a1c1e;' +
        'font-family:system-ui,sans-serif;text-align:center;padding:24px}' +
        'p{margin:0;max-width:320px;font-size:14px;line-height:1.5;color:#63676c}</style>' +
        '</head><body><h1 style="font-size:22px;margin:0">Đang ngoại tuyến</h1>' +
        '<p>Chưa có nội dung nào tải sẵn trên máy. Hãy mở lại Kno-Notes khi có mạng ít nhất một lần.</p>' +
        '</body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
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
