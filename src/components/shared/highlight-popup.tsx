'use client';

import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Icon } from '@/components/ui/icon';

/** Keep the bubble 90px inside the horizontal edges and never above y = 56. */
export function clampHighlightPosition(x: number, y: number, viewportWidth: number) {
  return { x: Math.max(90, Math.min(viewportWidth - 90, x)), y: Math.max(56, y) };
}

export interface HighlightPopupProps {
  mode: 'add' | 'remove';
  /** Viewport px, pre-clamp. */
  x: number;
  y: number;
  viewportWidth: number;
  onAction: () => void;
}

/** fixed · translate(-50%, calc(-100% - 10px)) · z80 · p4 · r10 · --text bg · 32px button. */
export function HighlightPopup({ mode, x, y, viewportWidth, onAction }: HighlightPopupProps) {
  const pos = clampHighlightPosition(x, y, viewportWidth);
  const label = mode === 'remove' ? 'Bỏ đánh dấu' : 'Đánh dấu';

  return (
    <div
      data-hlpop="1"
      data-mode={mode}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed flex rounded-10 bg-text p-4 shadow-card"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        zIndex: Z.highlightPopup,
      }}
    >
      <button
        type="button"
        onClick={onAction}
        className="flex h-32 items-center gap-7 whitespace-nowrap rounded-7 border-0 bg-transparent px-12 text-13 font-medium text-bg hover:bg-[rgba(127,127,127,.25)]"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-12 w-12 rounded-3 border border-[rgba(127,127,127,.4)]',
            mode === 'remove' ? 'bg-transparent' : 'bg-hl2',
          )}
        />
        <Icon name="highlight" size={15} />
        {label}
      </button>
    </div>
  );
}
