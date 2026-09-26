'use client';

import { cn } from '@/lib/utils';

export interface QuizHistoryEntry {
  id: string;
  score: number;
  total: number;
  dateLabel: string;
}

/** ≥80% --ok · ≥50% --med · <50% --hi (Design Spec §01). */
export function scoreToneClass(pct: number): string {
  if (pct >= 80) return 'bg-ok';
  if (pct >= 50) return 'bg-med';
  return 'bg-hi';
}

export const QUIZ_HISTORY_EMPTY =
  'Chưa có lần làm bài nào. Ôn lại kiến thức bằng bộ câu hỏi tạo từ ghi chú này.';

export interface QuizHistoryListProps {
  entries: readonly QuizHistoryEntry[];
  onOpen: (id: string) => void;
  className?: string;
}

export function QuizHistoryList({ entries, onOpen, className }: QuizHistoryListProps) {
  if (entries.length === 0) {
    return <div className={cn('text-13 leading-[1.5] text-muted', className)}>{QUIZ_HISTORY_EMPTY}</div>;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {entries.map((entry) => {
        const pct = entry.total > 0 ? Math.round((entry.score / entry.total) * 100) : 0;
        return (
          <button
            key={entry.id}
            type="button"
            data-quiz-history-item=""
            onClick={() => onOpen(entry.id)}
            className="flex flex-col gap-6 rounded-10 border-0 bg-transparent py-9 px-10 text-left text-text hover:bg-surface2"
          >
            <span className="flex w-full items-baseline justify-between gap-8">
              <span className="text-13 font-medium">
                <span className="font-mono">{`${entry.score}/${entry.total}`}</span>
                {` · ${pct}%`}
              </span>
              <span className="text-12 text-faint">{entry.dateLabel}</span>
            </span>
            <span className="block h-4 w-full overflow-hidden rounded-2 bg-surface2">
              <span className={cn('block h-full rounded-2', scoreToneClass(pct))} style={{ width: `${pct}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
