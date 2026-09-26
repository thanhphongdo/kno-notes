import type { Metadata } from 'next';
import { OfflineReader } from '@/components/features/offline/offline-reader';

export const metadata: Metadata = { title: 'Đang ngoại tuyến' };

/** Next không cho page export thêm tên nào khác, nên hằng này ở lại đây. */
const OFFLINE_HEADING = 'Đang ngoại tuyến';

/**
 * Trang service worker phục vụ khi một điều hướng không tới được mạng.
 *
 * Nó được precache nên phải dựng được với KHÔNG phiên đăng nhập, KHÔNG dữ liệu
 * từ máy chủ và KHÔNG một lời gọi mạng nào.
 *
 * Tiêu đề và câu giải thích được render ở máy chủ, KHÔNG phải trong
 * `OfflineReader`: nếu vì lý do gì mà JavaScript của trang này không tải được
 * (cache thiếu, thiết bị chặn script), người dùng vẫn phải biết chuyện gì đang
 * xảy ra. Danh sách ghi chú đã tải là phần tăng cường nằm bên dưới.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-740 flex-col gap-20 bg-bg px-16 pt-24 pb-64 text-text min-[820px]:px-40">
      <div className="flex flex-wrap items-center gap-10">
        <span
          aria-hidden="true"
          className="flex h-32 w-32 items-center justify-center rounded-9 bg-accent font-serif text-17 font-bold text-accent-ink"
        >
          K
        </span>
        <h1 className="m-0 font-serif text-22 font-semibold">{OFFLINE_HEADING}</h1>
      </div>
      <OfflineReader />
    </div>
  );
}
