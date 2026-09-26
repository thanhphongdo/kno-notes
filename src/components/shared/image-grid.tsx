'use client';

import { cn } from '@/lib/utils';
import { ImageThumb, type NoteImage } from './image-thumb';

export interface ImageGridProps {
  images: readonly NoteImage[];
  /** detail: auto-fill minmax(160px, 1fr) gap 12 · editor: 3 fixed columns gap 8. */
  variant?: 'detail' | 'editor';
  onOpen?: (index: number) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

export function ImageGrid({ images, variant = 'detail', onOpen, onRemove, className }: ImageGridProps) {
  if (images.length === 0) return null;
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
