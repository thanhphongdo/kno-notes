'use client';

import { cn } from '@/lib/utils';

export interface HighlightSnippetProps {
  text: string;
  /** Số dòng trước khi cắt. Rail dùng 3, hàng gợi ý tìm kiếm dùng 1. */
  lines?: 1 | 2 | 3;
  /** Cỡ chữ serif — 14 ở rail, 13 trong panel gợi ý. */
  size?: '13' | '14';
  className?: string;
}

const CLAMP: Record<1 | 2 | 3, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
};

/**
 * Một đoạn văn bản hiển thị đúng như khi nó được đánh dấu trong ghi chú:
 * nền `--hl`, serif, r4, py 2 px 6 (So Lam Sang.dc.html, rail "Đoạn đã đánh dấu").
 *
 * Dùng chung ở HAI nơi và chỉ được viết ở đây: danh sách trên rail của trang
 * ghi chú, và dòng "vì sao khớp" trong panel gợi ý tìm kiếm. Hai chỗ đó phải
 * trông giống hệt nhau — người đọc nhận ra ngay đây là đoạn chính họ đã bôi.
 */
export function HighlightSnippet({ text, lines = 3, size = '14', className }: HighlightSnippetProps) {
  return (
    <span
      data-highlight-snippet=""
      className={cn(
        'min-w-0 break-words rounded-4 bg-hl py-2 px-6 font-serif leading-[1.5] text-text',
        size === '14' ? 'text-14' : 'text-13',
        CLAMP[lines],
        className,
      )}
    >
      {text}
    </span>
  );
}
