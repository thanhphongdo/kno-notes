'use client';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';

export interface NoteImage {
  id: string;
  label: string;
  /** Empty string renders the 135° striped placeholder from the prototype. */
  src: string;
}

const STRIPE_DETAIL = 'repeating-linear-gradient(135deg, var(--surface2) 0 10px, var(--bg) 10px 20px)';
const STRIPE_EDITOR = 'repeating-linear-gradient(135deg, var(--surface2) 0 8px, var(--bg) 8px 16px)';

export const ALT_PLACEHOLDER = 'Mô tả ảnh (alt)';

export interface ImageThumbProps {
  image: NoteImage;
  /**
   * `detail` = aspect 4/3, r10, caption below · `editor` = aspect 1, r8,
   * remove button · `row` = 44px thumb + ô nhập alt + nút gỡ, dùng ở rail của
   * trình soạn thảo nơi mỗi ảnh cần chỗ để gõ alt.
   */
  variant?: 'detail' | 'editor' | 'row';
  onOpen?: () => void;
  onRemove?: () => void;
  /** Chỉ `row`: alt vừa là chú thích dưới ảnh, vừa là thứ tìm kiếm soi tới. */
  onLabelChange?: (label: string) => void;
  className?: string;
}

export function ImageThumb({
  image, variant = 'detail', onOpen, onRemove, onLabelChange, className,
}: ImageThumbProps) {
  if (variant === 'row') {
    return (
      <div data-image-thumb="" className={cn('flex items-center gap-10', className)}>
        <span
          className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-8 border border-line"
          style={{ background: STRIPE_EDITOR }}
        >
          {image.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.src} alt={image.label} className="block h-full w-full object-cover" />
          ) : null}
        </span>
        <Input
          value={image.label}
          placeholder={ALT_PLACEHOLDER}
          aria-label={`Mô tả ảnh ${image.label || 'chưa đặt tên'}`}
          onChange={(e) => onLabelChange?.(e.target.value)}
          className="flex-1"
        />
        {onRemove ? (
          <IconButton
            icon="close"
            label={`Gỡ ảnh ${image.label || 'chưa đặt tên'}`}
            size={30}
            radius="6"
            iconSize={12}
            strokeWidth={2.2}
            tone="faint"
            hoverTone="hi"
            onClick={onRemove}
          />
        ) : null}
      </div>
    );
  }

  if (variant === 'editor') {
    return (
      <div
        data-image-thumb=""
        className={cn('relative aspect-square overflow-hidden rounded-8 border border-line', className)}
        style={{ background: STRIPE_EDITOR }}
      >
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.label} className="block h-full w-full object-cover" />
        ) : null}
        {onRemove ? (
          <IconButton
            icon="close"
            label={`Gỡ ảnh ${image.label}`}
            variant="overlay"
            size={22}
            radius="6"
            iconSize={10}
            strokeWidth={2.6}
            onClick={onRemove}
            className="absolute right-4 top-4"
          />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-image-thumb=""
      onClick={onOpen}
      aria-label={`Mở ảnh ${image.label}`}
      // `min-w-0`: một ô lưới mặc định có `min-width: auto`, nghĩa là nó không
      // được phép hẹp hơn nội dung của chính nó. Thiếu dòng này, một chú thích
      // dài sẽ tự bẻ rộng ô ra và đẩy cả trang tràn ngang.
      className={cn('flex min-w-0 cursor-zoom-in flex-col gap-8 border-0 bg-transparent p-0 text-left', className)}
    >
      <span
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-10 border border-line"
        style={{ background: STRIPE_DETAIL }}
      >
        {image.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt={image.label} className="block h-full w-full object-cover" />
        ) : (
          <span className="font-mono text-11 text-faint">hình ảnh</span>
        )}
      </span>
      {/*
        Xuống dòng, tối đa hai dòng — KHÔNG phải `truncate` một dòng.
        Chú thích giờ là alt do người dùng viết nên nó dài như một câu thật;
        `white-space: nowrap` khiến bề rộng tối thiểu của nó bằng cả câu, và
        chỉ cần một chỗ nào đó không kịp cắt là chữ tràn ra ngoài, đè lên
        chú thích bên cạnh. Chữ biết xuống dòng thì không bao giờ rộng hơn
        một từ, nên tràn ngang là chuyện không thể xảy ra.
      */}
      <span className="line-clamp-2 w-full min-w-0 break-words text-12 leading-[1.4] text-muted">
        {image.label}
      </span>
    </button>
  );
}
