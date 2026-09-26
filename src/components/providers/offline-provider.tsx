'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useOfflineSync, type OfflineSync } from '@/hooks/use-offline-sync';

const OfflineContext = createContext<OfflineSync | null>(null);

/**
 * Một bản đồng bộ duy nhất cho cả app.
 *
 * Nếu mỗi nơi cần trạng thái lại tự gọi `useOfflineSync`, mỗi nơi sẽ tự tải
 * trước toàn bộ ghi chú một lần — vài chục request thừa và hai lịch chạy đá
 * nhau. Engine chạy ở đây, chỗ khác chỉ đọc.
 */
export function OfflineProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const sync = useOfflineSync({ enabled });
  return <OfflineContext.Provider value={sync}>{children}</OfflineContext.Provider>;
}

/** `null` ngoài phạm vi provider — trang đăng nhập không cần đồng bộ gì. */
export function useOffline(): OfflineSync | null {
  return useContext(OfflineContext);
}
