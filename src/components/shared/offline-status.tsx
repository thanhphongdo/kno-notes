'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const OFFLINE_TITLE = 'Đọc ngoại tuyến';
export const OFFLINE_SYNC_ACTION = 'Tải ngay';

export interface OfflineStatusProps {
  online: boolean;
  phase: 'idle' | 'syncing' | 'ready' | 'offline';
  cached: number;
  total: number;
  pending: number;
  onSyncNow: () => void;
  className?: string;
}

/**
 * Câu mô tả trạng thái kho ngoại tuyến. Một câu, không biểu đồ, không phần
 * trăm — thứ người dùng cần biết là "mất mạng thì tôi còn đọc được gì".
 */
export function offlineSummary(props: Pick<OfflineStatusProps, 'online' | 'phase' | 'cached' | 'total' | 'pending'>): string {
  const { online, phase, cached, total, pending } = props;

  if (pending > 0 && !online) {
    return `${pending} thay đổi đang chờ gửi khi có mạng lại.`;
  }
  if (phase === 'syncing') {
    return total > 0 ? `Đang tải ${cached}/${total} ghi chú về máy…` : 'Đang tải ghi chú về máy…';
  }
  if (!online) {
    return cached > 0
      ? `Đang ngoại tuyến — ${cached} ghi chú đọc được.`
      : 'Đang ngoại tuyến và chưa có ghi chú nào tải sẵn.';
  }
  if (pending > 0) return `Đang gửi ${pending} thay đổi làm lúc ngoại tuyến…`;
  if (cached === 0) return 'Chưa tải ghi chú nào về máy.';
  if (total > 0 && cached < total) return `Đã tải ${cached}/${total} ghi chú để đọc khi mất mạng.`;
  return `Đã tải ${cached} ghi chú — đọc được cả khi mất mạng.`;
}

/** Khối trạng thái trong bảng Giao diện. */
export function OfflineStatus({
  online, phase, cached, total, pending, onSyncNow, className,
}: OfflineStatusProps) {
  return (
    <div data-offline-status={phase} className={cn('flex flex-col gap-8', className)}>
      <div className="text-12 font-medium text-muted">{OFFLINE_TITLE}</div>
      <div className="text-12 leading-[1.5] text-faint">
        {offlineSummary({ online, phase, cached, total, pending })}
      </div>
      <Button
        variant="secondary"
        size="30"
        radius="8"
        onClick={onSyncNow}
        disabled={!online || phase === 'syncing'}
        className="self-start px-12"
      >
        {OFFLINE_SYNC_ACTION}
      </Button>
    </div>
  );
}
