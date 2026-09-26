'use client';

import { cn } from '@/lib/utils';
import { HighlightSnippet } from './highlight-snippet';
import { PriorityDot, type Priority } from './priority';

export interface NoteBriefRowProps {
  title: string;
  /** Dòng phụ: thẻ và thời điểm cập nhật. */
  sub: string;
  priority: Priority;
  /** Đoạn đã đánh dấu giải thích vì sao ghi chú này khớp. */
  highlight?: string;
  onClick: () => void;
  /** `comfortable` nới cao hàng cho ngón tay (Design Spec §06). */
  density?: 'compact' | 'comfortable';
  className?: string;
}

/**
 * Một dòng ghi chú rút gọn: chấm ưu tiên, tiêu đề serif, dòng phụ.
 *
 * Dùng ở panel gợi ý tìm kiếm và ở màn hình đọc ngoại tuyến. Chỉ được viết ở
 * đây (quy tắc số 1) — hai chỗ đó phải trông giống hệt nhau, vì với người đọc
 * chúng là cùng một thứ: một ghi chú đang được chỉ tới.
 */
export function NoteBriefRow({
  title, sub, priority, highlight, onClick, density = 'compact', className,
}: NoteBriefRowProps) {
  const roomy = density === 'comfortable';
  return (
    <button
      type="button"
      data-note-brief=""
      onClick={onClick}
      className={cn(
        'flex items-start gap-10 rounded-8 border-0 bg-transparent text-left text-text hover:bg-surface2',
        roomy ? 'px-14 py-12' : 'px-10 py-9',
        className,
      )}
    >
      <PriorityDot priority={priority} size={7} className="mt-7" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="truncate font-serif text-15 font-semibold">{title}</span>
        <span className="truncate text-12 text-muted">{sub}</span>
        {highlight ? (
          <HighlightSnippet text={highlight} lines={1} size="13" className="mt-2 max-w-full self-start" />
        ) : null}
      </span>
    </button>
  );
}
