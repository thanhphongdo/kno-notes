// src/lib/pwa/build-id.ts
//
// Dấu vân tay của bản deploy, dùng để service worker biết mình đã cũ.
//
// Trình duyệt chỉ cài service worker mới khi FILE `sw.js` đổi byte. `sw.js`
// của app là tĩnh và giống hệt nhau qua mọi lần deploy, nên nếu đăng ký bằng
// đúng một URL thì bản đã cài trên máy người dùng sẽ không bao giờ được thay —
// kho cache của nó (trang /offline, manifest, icon) đứng yên mãi mãi.
//
// Cách chữa: gắn build id vào query. `/sw.js?v=abc` và `/sw.js?v=def` là hai
// script URL khác nhau, nên registration được cập nhật; query không ảnh hưởng
// tới scope, vốn lấy từ đường dẫn.

/** Mặc định khi không chạy trên Vercel — mọi bản local là "một bản". */
export const DEV_BUILD_ID = 'dev';

/** Rút gọn SHA cho dễ đọc trong DevTools; đủ dài để không đụng nhau. */
const SHORT_SHA = 12;

/**
 * Build id cho một lần deploy. Nhận `env` để test được, và để chỗ gọi quyết
 * định lấy biến nào (`next.config.ts` đọc `VERCEL_GIT_COMMIT_SHA` lúc build).
 */
export function buildIdFrom(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return DEV_BUILD_ID;
  // Chỉ giữ ký tự an toàn cho URL: SHA thì luôn hợp lệ, biến môi trường bị
  // đặt tay thì chưa chắc.
  const safe = trimmed.replace(/[^A-Za-z0-9._-]/g, '');
  return safe.slice(0, SHORT_SHA) || DEV_BUILD_ID;
}

/** URL đăng ký service worker cho một build. */
export function serviceWorkerUrl(buildId: string): string {
  return `/sw.js?v=${encodeURIComponent(buildIdFrom(buildId))}`;
}
