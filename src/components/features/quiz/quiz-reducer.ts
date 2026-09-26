import type { Question, Quiz } from '@/lib/types';

export type QuizStatus = 'loading' | 'asking' | 'done';

export interface QuizState {
  status: QuizStatus;
  questions: Question[];
  /** Index of the question on screen. */
  i: number;
  picks: (number | null)[];
  source: 'ai' | 'offline' | null;
  /** True when a stored attempt is being reviewed: nothing is recorded. */
  review: boolean;
  attempt: Quiz | null;
}

export type QuizAction =
  | { type: 'restart' }
  | { type: 'loaded'; questions: Question[]; source: 'ai' | 'offline' }
  | { type: 'pick'; index: number }
  | { type: 'next' }
  | { type: 'finish'; attempt: Quiz }
  | { type: 'openReview'; attempt: Quiz };

export const initialQuizState: QuizState = {
  status: 'loading',
  questions: [],
  i: 0,
  picks: [],
  source: null,
  review: false,
  attempt: null,
};

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'restart':
      return initialQuizState;

    case 'loaded':
      return {
        ...initialQuizState,
        status: 'asking',
        questions: action.questions,
        picks: action.questions.map(() => null),
        source: action.source,
      };

    case 'pick': {
      // One pick per question, locked after the first (prototype `quizPick`).
      if (state.status !== 'asking' || state.picks[state.i] != null) return state;
      const picks = [...state.picks];
      picks[state.i] = action.index;
      return { ...state, picks };
    }

    case 'next': {
      if (state.status !== 'asking') return state;
      if (state.picks[state.i] == null) return state;
      // The controller dispatches 'finish' on the last question instead.
      if (state.i >= state.questions.length - 1) return state;
      return { ...state, i: state.i + 1 };
    }

    case 'finish':
      return { ...state, status: 'done', review: false, attempt: action.attempt };

    case 'openReview':
      return {
        status: 'done',
        questions: action.attempt.questions,
        i: Math.max(0, action.attempt.questions.length - 1),
        picks: [...action.attempt.picks],
        source: action.attempt.source,
        review: true,
        attempt: action.attempt,
      };
  }
}

/** Never trust a stored score: always recompute from picks vs answers. */
export function scoreOf(questions: readonly Question[], picks: readonly (number | null)[]): number {
  return questions.reduce((sum, q, i) => sum + (picks[i] === q.answer ? 1 : 0), 0);
}

/** The last ten question texts of previous attempts, passed to the generator. */
export function avoidFrom(attempts: readonly Quiz[]): string[] {
  return attempts.flatMap((a) => a.questions.map((q) => q.q)).slice(-10);
}
