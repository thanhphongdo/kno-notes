'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const PRESENTATION_CTA_TITLE = 'Bản trình chiếu đã sẵn sàng';
export const PRESENTATION_CTA_ACTION = 'Trình chiếu';

export interface PresentationCtaProps {
  slideCount: number;
  onStart: () => void;
  className?: string;
}

/**
 * Lối vào chế độ trình chiếu, đặt trong bài. CHỈ dựng khi ghi chú thật sự có
 * bộ slide — nơi gọi kiểm bằng `hasSlides()`.
 *
 * Mockup: flex gap 14, padding 16/18, viền 1px, bán kính 12, nền --panel;
 * dưới 820px xếp dọc và nút giãn hết chiều ngang.
 */
export function PresentationCta({ slideCount, onStart, className }: PresentationCtaProps) {
  return (
    <div
      className={cn(
        'my-30 flex flex-col items-stretch gap-12 rounded-12 border border-line bg-surface px-18 py-16',
        'min-[820px]:flex-row min-[820px]:items-center min-[820px]:gap-14',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <b className="mb-3 block text-14 font-semibold">{PRESENTATION_CTA_TITLE}</b>
        <span className="text-13 text-muted">
          {`${slideCount} slide, dựng từ chính nội dung ghi chú này.`}
        </span>
      </div>
      <Button variant="primary" size="38" icon="present" iconSize={17} onClick={onStart}>
        {PRESENTATION_CTA_ACTION}
      </Button>
    </div>
  );
}
