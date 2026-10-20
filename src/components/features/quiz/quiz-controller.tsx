'use client';

import { QuizModal } from '@/components/shared';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useQuiz } from '@/hooks/use-quiz';
import type { Quiz } from '@/lib/types';

export interface QuizControllerProps {
  noteId: string;
  noteTitle: string;
  /** The note's stored attempts, newest first. */
  attempts: readonly Quiz[];
  /** Non-null opens that attempt in review mode and records nothing. */
  reviewAttemptId: string | null;
  /** Số câu dùng được trong bộ câu hỏi soạn sẵn của ghi chú. */
  questionTotal?: number;
  onClose: () => void;
}

/** State and API wiring for `QuizModal`, which renders all three states. */
export function QuizController({
  noteId, noteTitle, attempts, reviewAttemptId, questionTotal, onClose,
}: QuizControllerProps) {
  const isMobile = useIsMobile();
  const quiz = useQuiz({ noteId, attempts, reviewAttemptId, questionTotal, onClose });

  return (
    <QuizModal
      open
      noteTitle={noteTitle}
      review={quiz.review}
      status={quiz.status}
      questions={quiz.questions}
      picks={quiz.picks}
      index={quiz.i}
      isMobile={isMobile}
      completedAtLabel={quiz.completedAtLabel}
      source={quiz.source}
      lengthOptions={quiz.lengthOptions}
      onChooseLength={quiz.choose}
      onPick={quiz.pick}
      onNext={quiz.next}
      onRetry={quiz.retry}
      onClose={quiz.close}
    />
  );
}
