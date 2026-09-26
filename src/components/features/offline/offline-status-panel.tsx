'use client';

import { OfflineStatus } from '@/components/shared';
import { useOffline } from '@/components/providers/offline-provider';
import { useOfflineSnapshot } from '@/hooks/use-offline-sync';

/**
 * Khối "Đọc ngoại tuyến" trong bảng Giao diện.
 *
 * Tồn tại để việc đăng ký nghe trạng thái đồng bộ dừng lại ở ĐÂY. Nếu
 * `ShellClient` tự đọc, mỗi nhịp nền sẽ render lại cả khung app; component
 * này là lá, render lại nó không tốn gì.
 */
export function OfflineStatusPanel() {
  const sync = useOffline();
  const snapshot = useOfflineSnapshot(sync);
  if (!sync) return null;

  return (
    <OfflineStatus
      online={snapshot.online}
      phase={snapshot.phase}
      cached={snapshot.cached}
      total={snapshot.total}
      pending={snapshot.pending}
      onSyncNow={sync.syncNow}
    />
  );
}
