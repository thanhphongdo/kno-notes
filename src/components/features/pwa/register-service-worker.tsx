'use client';

import { useAppUpdate } from '@/hooks/use-app-update';

/**
 * Đăng ký service worker một lần, chỉ ở production.
 *
 * Việc đăng ký nằm trong `useAppUpdate` vì URL script phải mang build id —
 * xem `src/lib/pwa/build-id.ts`. Component này chỉ là chỗ gắn hook vào cây
 * React ở root layout, để cả trang đăng nhập và `/offline` cũng có worker.
 * Phần báo "đã có bản mới" là `UpdatePrompt`, nằm trong layout đã đăng nhập.
 *
 * Hai chỗ cùng gọi `register()` với CÙNG một URL là vô hại: trình duyệt trả
 * lại đúng registration đang có chứ không tạo thêm.
 *
 * Dev bị bỏ qua: một worker đứng trước endpoint HMR của Next làm hot reload
 * chập chờn.
 */
export function RegisterServiceWorker(): null {
  useAppUpdate();
  return null;
}
