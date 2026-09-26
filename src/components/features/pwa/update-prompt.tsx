'use client';

import { Button } from '@/components/ui';
import { PromptBar } from '@/components/shared';
import { useAppUpdate, type AppUpdate } from '@/hooks/use-app-update';

export const UPDATE_MESSAGE = 'Đã có bản Kno-Notes mới. Tải lại để dùng bản mới nhất.';
export const UPDATE_LABEL = 'Bản cập nhật';
export const UPDATE_ACTION = 'Tải lại';

export interface UpdatePromptProps {
  /** Seam cho test: bình thường component tự hỏi service worker. */
  update?: AppUpdate;
}

/**
 * Báo khi bản deploy mới đã tải xong trên máy.
 *
 * Không có nút "Để sau": bản mới chỉ cách một lần tải lại, và lần mở app kế
 * tiếp vốn đã là bản mới — nên thanh này biến mất cùng với trang, không cần
 * ghi nhớ gì.
 */
export function UpdatePrompt({ update }: UpdatePromptProps) {
  const auto = useAppUpdate({ enabled: update == null && process.env.NODE_ENV === 'production' });
  const { ready, apply } = update ?? auto;

  if (!ready) return null;

  return (
    <PromptBar
      label={UPDATE_LABEL}
      message={UPDATE_MESSAGE}
      icon="download"
      testId="update-prompt"
      testValue="ready"
    >
      <Button variant="primary" size="32" onClick={apply}>
        {UPDATE_ACTION}
      </Button>
    </PromptBar>
  );
}
