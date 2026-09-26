'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/** Catches anything thrown outside the `(app)` group — `/login`, `/offline`, 404s. */
export default function RootError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-bg p-24 text-center text-text">
      <div className="font-serif text-22 font-semibold">Đã có lỗi xảy ra</div>
      <div className="max-w-320 text-14 leading-[1.5] text-muted">
        Không tải được trang. Thử lại hoặc tải lại trình duyệt.
      </div>
      <Button variant="secondary" size="36" radius="8" className="mt-8" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
