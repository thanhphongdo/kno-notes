'use client';

import { cn } from '@/lib/utils';
import { ImageThumb, type NoteImage } from './image-thumb';

export interface ImageGridProps {
  images: readonly NoteImage[];
  /**
   * detail: auto-fill minmax(160px, 1fr) gap 12 · editor: 3 fixed columns gap 8
   * · row: xếp dọc, mỗi ảnh một hàng kèm ô nhập alt.
   */
  variant?: 'detail' | 'editor' | 'row';
  onOpen?: (index: number) => void;
  onRemove?: (id: string) => void;
  /** Chỉ `row`. */
  onLabelChange?: (id: string, label: string) => void;
  className?: string;
}

export function ImageGrid({
  images, variant = 'detail', onOpen, onRemove, onLabelChange, className,
}: ImageGridProps) {
  if (images.length === 0) return null;

  if (variant === 'row') {
    return (
      <div className={cn('flex flex-col gap-10', className)}>
        {images.map((image) => (
          <ImageThumb
            key={image.id}
            image={image}
            variant="row"
            onRemove={onRemove ? () => onRemove(image.id) : undefined}
            onLabelChange={onLabelChange ? (label) => onLabelChange(image.id, label) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('grid', variant === 'detail' ? 'gap-12' : 'gap-8', className)}
      style={{
        gridTemplateColumns:
          variant === 'detail' ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(3, minmax(0, 1fr))',
      }}
    >
      {images.map((image, i) => (
        <ImageThumb
          key={image.id}
          image={image}
          variant={variant}
          onOpen={onOpen ? () => onOpen(i) : undefined}
          onRemove={onRemove ? () => onRemove(image.id) : undefined}
        />
      ))}
    </div>
  );
}
