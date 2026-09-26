'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const DELETE_CONFIRM_MESSAGE = 'Xoá vĩnh viễn ghi chú này và toàn bộ phiên bản?';

export const DELETE_CONFIRM_LABEL = 'Xoá';
export const DELETE_CANCEL_LABEL = 'Huỷ';

export interface DeleteConfirmBannerProps {
  message?: string;
  /** Wording of the destructive action. Defaults to 'Xoá'. */
  confirmLabel?: string;
  /** Wording of the way out. Defaults to 'Huỷ'. */
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}

/** py 14 px 16 · r12 · --hi-soft / --hi · inline confirmation, never a system dialog. */
export function DeleteConfirmBanner({
  message = DELETE_CONFIRM_MESSAGE,
  confirmLabel = DELETE_CONFIRM_LABEL,
  cancelLabel = DELETE_CANCEL_LABEL,
  onCancel, onConfirm, className,
}: DeleteConfirmBannerProps) {
  return (
    <div
      role="alertdialog"
      aria-label={message}
      className={cn('flex flex-wrap items-center gap-12 rounded-12 bg-hi-soft py-14 px-16 text-14 text-hi', className)}
    >
      <span className="flex-1">{message}</span>
      <Button variant="dangerGhost" size="32" radius="8" onClick={onCancel} className="px-12">
        {cancelLabel}
      </Button>
      <Button variant="danger" size="32" radius="8" onClick={onConfirm} className="px-12">
        {confirmLabel}
      </Button>
    </div>
  );
}
