'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  avoidFrom, initialQuizState, quizReducer, scoreOf, type QuizState,
} from '@/components/features/quiz/quiz-reducer';
import { useToast } from '@/components/ui';
import { fmt } from '@/lib/text';
import type { Question, Quiz } from '@/lib/types';

export const NOT_ENOUGH_CONTENT = 'Ghi chú chưa đủ nội dung để tạo câu hỏi';
const GENERATE_FAILED = 'Không tạo được câu hỏi';
const SAVE_FAILED = 'Không lưu được kết quả';

export interface UseQuizOptions {
  noteId: string;
  /** The note's stored attempts, newest first. */
  attempts: readonly Quiz[];
  /** Non-null opens that attempt in review mode and records nothing. */
  reviewAttemptId: string | null;
  onClose: () => void;
}

export interface UseQuizResult extends QuizState {
  completedAtLabel: string | undefined;
  pick: (index: number) => void;
  next: () => void;
  retry: () => void;
  close: () => void;
}

/** 'dd/mm/yyyy · HH:MM' — the label under the score. */
function completedAt(attempt: Quiz | null): string | undefined {
  if (!attempt) return undefined;
  const time = new Date(attempt.date).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${fmt(attempt.date)} · ${time}`;
}

/**
 * The quiz state machine: loading → asking → done (prototype `startQuiz`,
 * `quizPick`, `quizNext`). Every generate run carries a monotonically
 * increasing token; closing the modal bumps the token, so a response that
 * arrives after the close is dropped — nothing renders and nothing is saved.
 */
export function useQuiz({ noteId, attempts, reviewAttemptId, onClose }: UseQuizOptions): UseQuizResult {
  const router = useRouter();
  const { flash } = useToast();
  const [state, dispatch] = useReducer(quizReducer, initialQuizState);
  const token = useRef(0);
  // Read inside async work only, so a new attempts array never restarts a run.
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;

  const generate = useCallback(async () => {
    const mine = ++token.current;
    dispatch({ type: 'restart' });

    const fail = (message: string) => {
      flash(message);
      onClose();
    };

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avoid: avoidFrom(attemptsRef.current) }),
      });
      if (token.current !== mine) return; // closed while loading: drop the result
      if (!res.ok) {
        fail(res.status === 422 ? NOT_ENOUGH_CONTENT : GENERATE_FAILED);
        return;
      }
      const data = (await res.json()) as { questions?: Question[]; source?: 'ai' | 'offline' };
      if (token.current !== mine) return;
      if (!data.questions?.length) {
        fail(NOT_ENOUGH_CONTENT);
        return;
      }
      dispatch({ type: 'loaded', questions: data.questions, source: data.source ?? 'offline' });
    } catch {
      if (token.current !== mine) return;
      fail(GENERATE_FAILED);
    }
  }, [flash, noteId, onClose]);

  // Chosen once per mount: either a stored attempt, or a fresh set of questions.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stored = reviewAttemptId
      ? attemptsRef.current.find((a) => a.id === reviewAttemptId)
      : undefined;
    if (stored) {
      dispatch({ type: 'openReview', attempt: stored });
      return;
    }
    void generate();
  }, [generate, reviewAttemptId]);

  const close = useCallback(() => {
    token.current += 1;
    onClose();
  }, [onClose]);

  const finish = useCallback(async () => {
    const mine = token.current;
    const { questions, picks, source } = state;
    const score = scoreOf(questions, picks);
    const body = {
      questions,
      picks,
      score,
      total: questions.length,
      source: source ?? 'offline',
    };

    const local: Quiz = {
      id: 'local',
      date: new Date().toISOString(),
      ...body,
      source: body.source,
    };

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (token.current !== mine) return;
      if (!res.ok) {
        flash(SAVE_FAILED);
        dispatch({ type: 'finish', attempt: local });
        return;
      }
      const { quiz } = (await res.json()) as { quiz: Quiz };
      if (token.current !== mine) return;
      dispatch({ type: 'finish', attempt: quiz });
      router.refresh();
    } catch {
      if (token.current !== mine) return;
      flash(SAVE_FAILED);
      dispatch({ type: 'finish', attempt: local });
    }
  }, [flash, noteId, router, state]);

  const pick = useCallback((index: number) => dispatch({ type: 'pick', index }), []);

  const next = useCallback(() => {
    if (state.status !== 'asking' || state.picks[state.i] == null) return;
    if (state.i >= state.questions.length - 1) void finish();
    else dispatch({ type: 'next' });
  }, [finish, state.i, state.picks, state.questions.length, state.status]);

  const retry = useCallback(() => {
    void generate();
  }, [generate]);

  return { ...state, completedAtLabel: completedAt(state.attempt), pick, next, retry, close };
}
