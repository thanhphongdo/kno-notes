'use client';

import { useEffect, type MouseEvent } from 'react';
import { Z } from '@/lib/z';
import { IconButton } from '@/components/ui/icon-button';
import type { NoteImage } from './image-thumb';

export interface LightboxProps {
  images: readonly NoteImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** fixed inset-0 · rgba(8,9,10,.88) · z100 · image max 92vw × 78vh r8 · close 40 r10. */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const total = images.length;
  const current = images[index];

  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + total) % total);
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % total);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, total, onClose, onIndexChange]);

  if (total === 0 || !current) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
      onClick={onClose}
      className="fixed inset-0 flex flex-col items-center justify-center gap-16 bg-[rgba(8,9,10,.88)] p-24"
      style={{ zIndex: Z.lightbox }}
    >
      <IconButton
        icon="close"
        label="Đóng"
        variant="lightbox"
        size={40}
        radius="10"
        iconSize={18}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-16 top-16"
      />

      {current.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.src}
          alt={current.label}
          onClick={stop}
          className="block max-h-[78vh] max-w-[92vw] rounded-8"
        />
      ) : (
        <div
          onClick={stop}
          className="flex aspect-[4/3] max-h-[74vh] w-[min(80vw,900px)] items-center justify-center rounded-10 font-mono text-13 text-[#7c8388]"
          style={{ background: 'repeating-linear-gradient(135deg, #1c1f21 0 14px, #232729 14px 28px)' }}
        >
          {`hình ảnh · ${current.label}`}
        </div>
      )}

      <div onClick={stop} className="flex items-center gap-16 text-14 text-[#e6e7e5]">
        {total > 1 ? (
          <IconButton
            icon="chevron-left"
            label="Ảnh trước"
            variant="lightbox"
            size={36}
            radius="9"
            iconSize={16}
            onClick={() => onIndexChange((index - 1 + total) % total)}
          />
        ) : null}
        <span>
          {current.label}
          <span className="ml-6 font-mono text-12 text-[#8a9095]">{`${index + 1} / ${total}`}</span>
        </span>
        {total > 1 ? (
          <IconButton
            icon="chevron-right"
            label="Ảnh sau"
            variant="lightbox"
            size={36}
            radius="9"
            iconSize={16}
            onClick={() => onIndexChange((index + 1) % total)}
          />
        ) : null}
      </div>
    </div>
  );
}
