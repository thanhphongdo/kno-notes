'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { serviceWorkerUrl } from '@/lib/pwa/build-id';

/** Nhắc trình duyệt soi lại `sw.js` mỗi giờ khi tab còn mở. */
export const UPDATE_POLL_MS = 60 * 60 * 1000;

export interface AppUpdate {
  /** Có bản deploy mới đã tải xong và đang chờ người dùng tải lại trang. */
  ready: boolean;
  /** Tải lại để dùng bản mới. */
  apply: () => void;
}

export interface UseAppUpdateOptions {
  /** Bỏ qua khi không phải production hoặc trình duyệt không có service worker. */
  enabled?: boolean;
  buildId?: string;
  /** Seam cho test. */
  reload?: () => void;
}

/**
 * Phát hiện app đã có bản mới, và chỉ báo — không tự tải lại.
 *
 * Vì sao không tự động: người dùng có thể đang gõ dở một ghi chú. Tải lại sau
 * lưng họ thì mất bài. Bản mới đã nằm sẵn trên máy, tải lại lúc nào là quyền
 * của họ; và lần mở app sau cũng sẽ là bản mới dù họ không bấm gì.
 *
 * Ba việc để một PWA đã cài không mắc kẹt ở bản cũ:
 *  1. Đăng ký `/sw.js?v=<build id>` — file `sw.js` không đổi byte giữa các bản
 *     deploy, nên nếu không có query thì trình duyệt không thấy gì mới.
 *  2. Gọi `registration.update()` mỗi khi tab được nhìn lại. App đã cài thường
 *     sống hàng tuần không reload; đây là lúc nó kiểm tra.
 *  3. Thêm một nhịp kiểm tra mỗi giờ cho tab mở lâu.
 */
export function useAppUpdate(options: UseAppUpdateOptions = {}): AppUpdate {
  const {
    enabled = process.env.NODE_ENV === 'production',
    buildId = process.env.NEXT_PUBLIC_BUILD_ID,
    reload,
  } = options;

  const [ready, setReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    const container = navigator.serviceWorker;

    /** Một worker vừa cài xong TRONG KHI đã có worker đang chạy = bản mới. */
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const onState = () => {
        if (worker.state !== 'installed') return;
        if (!container.controller) return; // lần cài đầu tiên, không phải bản mới
        if (!cancelled) setReady(true);
      };
      worker.addEventListener('statechange', onState);
      onState();
    };

    void container
      .register(serviceWorkerUrl(buildId ?? ''), { scope: '/' })
      .then((reg) => {
        if (cancelled) return;
        registration.current = reg;
        // Bản mới có thể đã chờ sẵn từ lần mở trước.
        if (reg.waiting && container.controller) setReady(true);
        watchInstalling(reg.installing);
        reg.addEventListener('updatefound', () => watchInstalling(reg.installing));
      })
      .catch(() => {
        /* PWA là lớp phụ: hỏng thì app vẫn chạy bình thường */
      });

    const check = () => {
      void registration.current?.update().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, UPDATE_POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [buildId, enabled]);

  const apply = useCallback(() => {
    // `sw.js` gọi skipWaiting ngay lúc install nên thường không có worker nào
    // đang chờ; nhắn vẫn vô hại và cứu được trường hợp có.
    registration.current?.waiting?.postMessage('SKIP_WAITING');
    (reload ?? (() => window.location.reload()))();
  }, [reload]);

  return { ready, apply };
}
