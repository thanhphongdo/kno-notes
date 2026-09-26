'use client';

import { useRouter } from 'next/navigation';
import {
  HighlightList, InfoGrid, QuizHistoryList, Rail, RailSection, VersionTimeline,
  type HighlightItem,
} from '@/components/shared';
import { fmt, rel } from '@/lib/text';
import type { Note } from '@/lib/types';
import { notePath, noteVersionPath } from './routes';

export interface DetailRailProps {
  note: Note;
  selectedVersion: number;
  latestVersion: number;
  highlights: readonly HighlightItem[];
  onRemoveHighlight: (id: string) => void;
  /** Word count of the note's current content. */
  words: number;
  onStartQuiz: () => void;
  onOpenQuizAttempt: (attemptId: string) => void;
}

/** Prototype lines 420-477 — the sticky right rail of the detail screen. */
export function DetailRail({
  note, selectedVersion, latestVersion, highlights, onRemoveHighlight,
  words, onStartQuiz, onOpenQuizAttempt,
}: DetailRailProps) {
  const router = useRouter();

  const versions = [...note.versions].reverse().map((v) => ({
    v: v.v,
    note: v.note,
    dateLabel: fmt(v.date),
    current: v.v === latestVersion,
  }));

  return (
    <Rail sticky basis={260}>
      <RailSection first label="Lịch sử phiên bản">
        <VersionTimeline
          versions={versions}
          selected={selectedVersion}
          onSelect={(v) => {
            router.push(v === latestVersion ? notePath(note.id) : noteVersionPath(note.id, v));
            window.scrollTo(0, 0);
          }}
        />
      </RailSection>

      <RailSection
        label="Lịch sử trắc nghiệm"
        action={
          <button
            type="button"
            onClick={onStartQuiz}
            className="border-0 bg-transparent p-0 text-12 font-medium text-accent"
          >
            + Làm bài
          </button>
        }
      >
        <QuizHistoryList
          entries={note.quizzes.map((z) => ({
            id: z.id,
            score: z.score,
            total: z.total,
            dateLabel: rel(z.date),
          }))}
          onOpen={onOpenQuizAttempt}
        />
      </RailSection>

      <RailSection label="Đoạn đã đánh dấu">
        <HighlightList highlights={highlights} onRemove={onRemoveHighlight} />
      </RailSection>

      <RailSection label="Thông tin">
        <InfoGrid
          items={[
            { key: 'Tạo', value: fmt(note.created) },
            { key: 'Cập nhật', value: fmt(note.updated) },
            { key: 'Số từ', value: String(words) },
            { key: 'Hình ảnh', value: String(note.images.length) },
          ]}
        />
      </RailSection>
    </Rail>
  );
}
