'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { QuizSource } from '@/lib/types';
import { QUIZ_LETTERS, type QuizQuestion } from './quiz-option';
import { SectionLabel } from './section-label';

/**
 * Nguồn của đề, nói bằng tiếng người.
 *
 * Có mặt ở đây vì trước kia nó vô hình: khi API key của Gemini hỏng, app âm
 * thầm rơi về bộ sinh tự động và không ai biết vì sao câu hỏi bỗng nông đi.
 */
export const QUIZ_SOURCE_LABEL: Record<QuizSource, string> = {
  bank: 'Bộ câu hỏi soạn sẵn của ghi chú',
  ai: 'Câu hỏi do AI tạo',
  offline: 'Câu hỏi tự dựng từ nội dung ghi chú',
};

export function quizScore(questions: readonly QuizQuestion[], picks: readonly (number | null)[]): number {
  return questions.reduce((sum, q, i) => sum + (picks[i] === q.answer ? 1 : 0), 0);
}

/** 0 when there are no questions — never NaN. */
export function quizPercent(score: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

export function quizVerdict(pct: number): string {
  if (pct >= 80) return 'Nắm vững';
  if (pct >= 50) return 'Cần ôn thêm';
  return 'Nên đọc lại ghi chú';
}

export function quizScoreTextClass(pct: number): string {
  if (pct >= 80) return 'text-ok';
  if (pct >= 50) return 'text-med';
  return 'text-hi';
}

export interface QuizResultProps {
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  /** Caption 'Lần làm bài' (review) vs 'Hoàn thành'. */
  review: boolean;
  /** 'dd/mm/yyyy · HH:MM'. */
  completedAtLabel?: string;
  /** Đề này lấy từ đâu. */
  source?: QuizSource | null;
  onRetry: () => void;
  onClose: () => void;
  className?: string;
}

export function QuizResult({
  questions, picks, review, completedAtLabel, source, onRetry, onClose, className,
}: QuizResultProps) {
  const total = questions.length;
  const score = quizScore(questions, picks);
  const pct = quizPercent(score, total);

  return (
    <div className={cn('flex flex-col gap-28', className)}>
      <div className="flex flex-col items-start gap-10 border-b border-line pb-24">
        <SectionLabel>{review ? 'Lần làm bài' : 'Hoàn thành'}</SectionLabel>
        <div className="flex flex-wrap items-baseline gap-14">
          <span className="font-serif text-64 font-semibold leading-none tracking-[-.03em]">{`${score}/${total}`}</span>
          <span className={cn('text-18 font-medium', quizScoreTextClass(pct))}>
            {`${pct}% · ${quizVerdict(pct)}`}
          </span>
        </div>
        {completedAtLabel ? <span className="text-14 text-muted">{completedAtLabel}</span> : null}
        {source ? (
          <span data-quiz-source={source} className="text-13 text-faint">
            {QUIZ_SOURCE_LABEL[source]}
          </span>
        ) : null}
        <div className="mt-10 flex flex-wrap gap-8">
          <Button variant="primary" size="42" onClick={onRetry}>
            Làm bộ câu hỏi mới
          </Button>
          <Button variant="secondary" size="42" onClick={onClose} className="border-line2">
            Về ghi chú
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-14">
        <SectionLabel>Xem lại đáp án</SectionLabel>
        {questions.map((question, i) => {
          const pick = picks[i] ?? null;
          const correct = pick === question.answer;
          const pickedLabel = pick == null ? '—' : `${QUIZ_LETTERS[pick]}. ${question.options[pick]}`;
          return (
            <div key={`${i}-${question.q}`} className="flex gap-14 rounded-12 border border-line bg-surface py-16 px-18">
              <span
                className={cn(
                  'flex h-24 w-24 shrink-0 items-center justify-center rounded-circle text-12 font-bold',
                  correct ? 'bg-ok-soft text-ok' : 'bg-hi-soft text-hi',
                )}
              >
                {correct ? '✓' : '✕'}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-6">
                <span className="font-serif text-16 font-semibold leading-[1.45]">{`${i + 1}. ${question.q}`}</span>
                <span className="text-14 leading-[1.5] text-muted">
                  {'Bạn chọn: '}
                  <span className={cn('font-medium', correct ? 'text-ok' : 'text-hi')}>{pickedLabel}</span>
                </span>
                {!correct ? (
                  <span className="text-14 leading-[1.5] text-muted">
                    {'Đáp án đúng: '}
                    <span className="font-medium text-ok">
                      {`${QUIZ_LETTERS[question.answer]}. ${question.options[question.answer]}`}
                    </span>
                  </span>
                ) : null}
                {question.explain ? (
                  <span className="text-13 leading-[1.55] text-muted">{question.explain}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
