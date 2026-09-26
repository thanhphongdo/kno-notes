'use client';

import { useEffect } from 'react';

/**
 * Last resort: the root layout itself failed, so there is no `<html>`, no
 * providers and no stylesheet to rely on. Everything here is inline and
 * self-contained on purpose.
 */
export default function GlobalError({
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
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
          textAlign: 'center',
          background: '#f6f6f3',
          color: '#1a1c1e',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 600 }}>Đã có lỗi xảy ra</div>
        <div style={{ fontSize: 14, color: '#63676c', maxWidth: 320, lineHeight: 1.5 }}>
          Không tải được trang. Thử lại hoặc tải lại trình duyệt.
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: '1px solid #d3d2cb',
            background: '#ffffff',
            color: '#1a1c1e',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Thử lại
        </button>
      </body>
    </html>
  );
}
