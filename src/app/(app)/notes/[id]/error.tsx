'use client';

import { EmptyState } from '@/components/shared';

export default function NoteDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-1120 px-16 pt-20 pb-80 min-[820px]:px-40 min-[820px]:pt-36">
      <EmptyState
        title="Không mở được ghi chú"
        description="Đã có lỗi xảy ra. Vui lòng thử lại."
        actionLabel="Thử lại"
        onAction={reset}
      />
    </div>
  );
}
