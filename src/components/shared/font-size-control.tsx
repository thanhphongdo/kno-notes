'use client';

import { cn } from '@/lib/utils';
import { FS_MAX, FS_MIN, clampFontSize } from '@/lib/theme';
import { Slider } from '@/components/ui/slider';

export const FONT_PREVIEW_TEXT = 'Adrenalin 0,5 mg tiêm bắp.';

export interface FontSizeControlProps {
  value: number;
  onChange: (size: number) => void;
  className?: string;
}

/** 30×30 r8 A buttons (serif 13 / serif 18), range 14–22 step 1, preview on --surface2 r8. */
export function FontSizeControl({ value, onChange, className }: FontSizeControlProps) {
  const size = clampFontSize(value);

  return (
    <div className={cn('flex flex-col gap-10', className)}>
      <div className="flex justify-between text-12 font-medium text-muted">
        <span>Cỡ chữ nội dung</span>
        <span className="font-mono">{`${size}px`}</span>
      </div>
      <div className="flex items-center gap-10">
        <button
          type="button"
          aria-label="Giảm cỡ chữ"
          onClick={() => onChange(Math.max(FS_MIN, size - 1))}
          className="h-30 w-30 shrink-0 rounded-8 border border-line bg-transparent font-serif text-13"
        >
          A
        </button>
        <Slider
          aria-label="Cỡ chữ nội dung"
          min={FS_MIN}
          max={FS_MAX}
          step={1}
          value={size}
          onChange={(e) => onChange(clampFontSize(e.target.value))}
        />
        <button
          type="button"
          aria-label="Tăng cỡ chữ"
          onClick={() => onChange(Math.min(FS_MAX, size + 1))}
          className="h-30 w-30 shrink-0 rounded-8 border border-line bg-transparent font-serif text-18"
        >
          A
        </button>
      </div>
      <div
        className="rounded-8 bg-surface2 px-12 py-10 font-serif leading-[1.6] text-muted"
        style={{ fontSize: `${size}px` }}
      >
        {FONT_PREVIEW_TEXT}
      </div>
    </div>
  );
}
