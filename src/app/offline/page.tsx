import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Đang ngoại tuyến' };

/**
 * Precached by the service worker and served whenever a navigation cannot
 * reach the network. It must render with no session, no data and no fetch —
 * nothing on this page may depend on anything but the stylesheet.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-bg p-24 text-center text-text">
      <span
        aria-hidden="true"
        className="flex h-40 w-40 items-center justify-center rounded-11 bg-accent font-serif text-22 font-bold text-accent-ink"
      >
        K
      </span>
      <div className="font-serif text-22 font-semibold">Đang ngoại tuyến</div>
      <div className="max-w-320 text-14 leading-[1.5] text-muted">
        Không có kết nối mạng. Các ghi chú đã mở sẽ hiện lại khi bạn trực tuyến trở lại.
      </div>
    </div>
  );
}
