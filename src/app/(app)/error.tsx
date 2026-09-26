'use client';

import { useEffect } from 'react';
import { EmptyState } from '@/components/shared';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-1160 px-16 pt-20 pb-64 min-[820px]:px-40 min-[820px]:pt-36">
      <EmptyState
        title="Không tải được nội dung"
        description="Đã có lỗi xảy ra. Thử tải lại trang."
        actionLabel="Thử lại"
        onAction={reset}
      />
    </div>
  );
}
