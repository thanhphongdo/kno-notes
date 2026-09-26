'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { QuizFeedback } from './quiz-feedback';
import { QUIZ_LETTERS, QuizOption, quizOptionState, type QuizQuestion } from './quiz-option';
import { QuizResult } from './quiz-result';

export type QuizStatus = 'loading' | 'asking' | 'done';

export interface QuizModalProps {
  open: boolean;
  noteTitle: string;
  review: boolean;
  status: QuizStatus;
  questions: readonly QuizQuestion[];
  picks: readonly (number | null)[];
  index: number;
  isMobile: boolean;
  completedAtLabel?: string;
  onPick: (optionIndex: number) => void;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** Full-screen: fixed inset-0 · --bg · z95. Header 64, progress 3px, body max 760. */
export function QuizModal({
  open, noteTitle, review, status, questions, picks, index, isMobile,
  completedAtLabel, onPick, onNext, onRetry, onClose,
}: QuizModalProps) {
  const total = questions.length;
  const question = questions[index];
  const pick = picks[index] ?? null;
  const answered = pick !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (status !== 'asking' || !question) return;
      if (e.key === 'Enter') {
        if (answered) {
          e.preventDefault();
          onNext();
        }
        return;
      }
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= 4) {
        e.preventDefault();
        onPick(n - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, status, question, answered, onClose, onNext, onPick]);

  if (!open) return null;

  const heading = review ? 'Kết quả trắc nghiệm' : 'Trắc nghiệm';
  const counter = status === 'asking' ? `${index + 1} / ${total}` : status === 'done' ? `${total} câu` : '';
  const progress = status === 'done' ? 100 : total > 0 ? ((index + (answered ? 1 : 0)) / total) * 100 : 0;
  const padX = isMobile ? 16 : 40;
  const padTop = isMobile ? 28 : 56;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 flex flex-col bg-bg"
      style={{ zIndex: Z.quiz }}
    >
      <div
        className="flex h-64 shrink-0 items-center gap-14 border-b border-line"
        style={{ paddingLeft: padX, paddingRight: padX }}
      >
        <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-9 bg-accent-soft text-accent">
          <Icon name="quiz" size={15} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-14 font-semibold">{heading}</span>
          <span className="truncate text-12 text-faint">{noteTitle}</span>
        </div>
        <span data-quiz-counter="" className="font-mono text-13 text-muted">{counter}</span>
        <IconButton icon="close" label="Đóng" size={40} radius="10" iconSize={18} tone="default" onClick={onClose} />
      </div>

      <div className="h-3 shrink-0 bg-line">
        <div
          data-quiz-progress=""
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-760 flex-col gap-28 pb-64"
          style={{ paddingTop: padTop, paddingLeft: padX, paddingRight: padX }}
        >
          {status === 'loading' ? (
            <div className="flex flex-col gap-18 pt-24">
              <div className="font-serif text-26 font-semibold tracking-[-.01em]">Đang soạn câu hỏi…</div>
              <div className="text-15 leading-[1.6] text-muted">
                Bộ câu hỏi được tạo từ chính nội dung của ghi chú này.
              </div>
              <SkeletonGroup label="Đang soạn câu hỏi…" className="mt-12">
                <Skeleton className="h-22 w-[80%]" radius="6" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
                <Skeleton className="h-52" radius="12" />
              </SkeletonGroup>
            </div>
          ) : null}

          {status === 'asking' && question ? (
            <>
              <div className="flex flex-col gap-12">
                <span className="font-mono text-12 font-medium text-accent">{`CÂU ${index + 1} / ${total}`}</span>
                <h2
                  className={cn(
                    'm-0 font-serif font-semibold leading-[1.35] tracking-[-.01em] [text-wrap:pretty]',
                    isMobile ? 'text-22' : 'text-28',
                  )}
                >
                  {question.q}
                </h2>
              </div>

              <div className="flex flex-col gap-10">
                {question.options.map((text, i) => (
                  <QuizOption
                    key={`${i}-${text}`}
                    letter={QUIZ_LETTERS[i] ?? ''}
                    text={text}
                    answered={answered}
                    state={quizOptionState({ answered, isAnswer: i === question.answer, isPicked: i === pick })}
                    onPick={() => onPick(i)}
                  />
                ))}
              </div>

              {answered ? (
                <QuizFeedback
                  correct={pick === question.answer}
                  answerLetter={QUIZ_LETTERS[question.answer] ?? ''}
                  explain={question.explain ?? ''}
                />
              ) : null}

              <div className="flex items-center justify-between gap-12 pt-4">
                <span className="text-12 text-faint">Phím 1–4 để chọn · Enter để tiếp tục</span>
                <Button
                  variant="primary"
                  size="44"
                  onClick={onNext}
                  disabled={!answered}
                  className={cn(!answered && 'opacity-35')}
                >
                  {index < total - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
                </Button>
              </div>
            </>
          ) : null}

          {status === 'done' ? (
            <QuizResult
              questions={questions}
              picks={picks}
              review={review}
              completedAtLabel={completedAtLabel}
              onRetry={onRetry}
              onClose={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
