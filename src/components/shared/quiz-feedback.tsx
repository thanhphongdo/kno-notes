'use client';

import { cn } from '@/lib/utils';

export interface QuizFeedbackProps {
  correct: boolean;
  answerLetter: string;
  explain: string;
  className?: string;
}

/** py16 px18 · r12 · ok-soft/hi-soft · title 14/600 · explanation 15/1.6. */
export function QuizFeedback({ correct, answerLetter, explain, className }: QuizFeedbackProps) {
  return (
    <div
      data-quiz-feedback=""
      data-correct={correct ? 'true' : 'false'}
      role="status"
      className={cn('flex flex-col gap-6 rounded-12 py-16 px-18', correct ? 'bg-ok-soft' : 'bg-hi-soft', className)}
    >
      <span className={cn('text-14 font-semibold', correct ? 'text-ok' : 'text-hi')}>
        {correct ? 'Chính xác' : `Chưa đúng — đáp án là ${answerLetter}`}
      </span>
      {explain ? <span className="text-15 leading-[1.6] text-text">{explain}</span> : null}
    </div>
  );
}
