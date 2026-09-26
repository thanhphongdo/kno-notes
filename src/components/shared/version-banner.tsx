'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export interface VersionBannerProps {
  /** e.g. 'v2'. */
  versionLabel: string;
  /** e.g. 'dd/mm/yyyy · ghi chú'. */
  dateLabel: string;
  onBackToCurrent: () => void;
  onRestore: () => void;
  className?: string;
}

/** py 12 px 16 · r12 · --med-soft / --med · 14px · clock icon 16. */
export function VersionBanner({ versionLabel, dateLabel, onBackToCurrent, onRestore, className }: VersionBannerProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-wrap items-center gap-12 rounded-12 bg-med-soft py-12 px-16 text-14 text-med', className)}
    >
      <Icon name="history" size={16} />
      <span className="min-w-160 flex-1">
        {'Đang xem '}
        <b className="font-mono">{versionLabel}</b>
        {` — ${dateLabel}`}
      </span>
      <Button variant="warnGhost" size="32" radius="8" onClick={onBackToCurrent} className="px-12">
        Về bản hiện tại
      </Button>
      <Button variant="warn" size="32" radius="8" onClick={onRestore} className="px-12">
        Khôi phục bản này
      </Button>
    </div>
  );
}
