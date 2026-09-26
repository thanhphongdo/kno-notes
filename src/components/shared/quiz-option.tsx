'use client';

import { cn } from '@/lib/utils';

export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface QuizQuestion {
  q: string;
  /** Exactly 4. */
  options: readonly string[];
  /** 0..3 */
  answer: number;
  explain?: string;
}

export type QuizOptionState = 'idle' | 'ok' | 'bad' | 'dim';

export function quizOptionState({
  answered, isAnswer, isPicked,
}: { answered: boolean; isAnswer: boolean; isPicked: boolean }): QuizOptionState {
  if (!answered) return 'idle';
  if (isAnswer) return 'ok';
  if (isPicked) return 'bad';
  return 'dim';
}

export interface QuizOptionProps {
  letter: string;
  text: string;
  state: QuizOptionState;
  answered: boolean;
  onPick: () => void;
  className?: string;
}

/** py14 px16 · r12 · gap 14 · key 26×26 r7 mono 12/600 · text 16/1.5 · verdict 12/600. */
export function QuizOption({ letter, text, state, answered, onPick, className }: QuizOptionProps) {
  const verdict = state === 'ok' ? 'Đúng' : state === 'bad' ? 'Sai' : '';
  return (
    <button
      type="button"
      data-quiz-option=""
      data-state={state}
      disabled={answered}
      onClick={onPick}
      className={cn(
        'flex items-start gap-14 rounded-12 border py-14 px-16 text-left text-16 leading-[1.5] text-text',
        'transition-[border-color,background-color] duration-150',
        state === 'ok' && 'border-ok bg-ok-soft',
        state === 'bad' && 'border-hi bg-hi-soft',
        (state === 'idle' || state === 'dim') && 'border-line bg-surface',
        answered ? 'cursor-default' : 'cursor-pointer hover:border-accent',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-26 w-26 shrink-0 items-center justify-center rounded-7 font-mono text-12 font-semibold',
          state === 'ok' && 'bg-ok text-surface',
          state === 'bad' && 'bg-hi text-surface',
          (state === 'idle' || state === 'dim') && 'bg-surface2 text-muted',
        )}
      >
        {letter}
      </span>
      <span className="flex-1 pt-1">{text}</span>
      {verdict ? (
        <span className={cn('pt-4 text-12 font-semibold', state === 'ok' ? 'text-ok' : 'text-hi')}>{verdict}</span>
      ) : null}
    </button>
  );
}
