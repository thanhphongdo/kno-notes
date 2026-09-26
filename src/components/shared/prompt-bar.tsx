'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/icon';
import { Z } from '@/lib/z';

export interface PromptBarProps {
  /** Nhãn cho trình đọc màn hình; cũng là "đây là hộp thoại gì". */
  label: string;
  message: string;
  /** Các nút hành động, xếp về bên phải. */
  children: ReactNode;
  icon?: IconName;
  /** Giá trị `data-*` để test và e2e bám vào. */
  testId?: string;
  testValue?: string;
  className?: string;
}

/**
 * Thanh nhắc neo đáy màn hình: một câu, vài nút.
 *
 * Dùng chung cho lời mời cài app và thông báo có bản mới. Hai chỗ đó từng có
 * cùng một khối markup; chỉ được viết ở đây (quy tắc số 1).
 *
 * `flex-wrap` dưới 820px là có chủ ý: trên máy 390px câu tiếng Việt đủ dài để
 * bị cắt mất chữ cuối nếu ép cùng hàng với nút — mà đó thường là chữ quan
 * trọng nhất.
 */
export function PromptBar({
  label, message, children, icon, testId, testValue, className,
}: PromptBarProps) {
  return (
    <div
      role="dialog"
      aria-label={label}
      {...(testId ? { [`data-${testId}`]: testValue ?? '' } : {})}
      className={cn(
        'fixed inset-x-16 bottom-16 mx-auto flex max-w-420 flex-wrap items-center gap-x-12 gap-y-10',
        'rounded-12 border border-line bg-surface px-16 py-14 shadow-card min-[820px]:flex-nowrap',
        className,
      )}
      style={{ zIndex: Z.settingsBackdrop }}
    >
      {icon ? (
        <span className="shrink-0 text-accent" aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <span className="min-w-180 flex-1 text-13 leading-[1.5]">{message}</span>
      <span className="ml-auto flex items-center gap-8">{children}</span>
    </div>
  );
}
