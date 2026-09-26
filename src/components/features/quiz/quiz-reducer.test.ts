import { describe, expect, it } from 'vitest';
import type { Question, Quiz } from '@/lib/types';
import { avoidFrom, initialQuizState, quizReducer, scoreOf } from './quiz-reducer';

const qs: Question[] = [
  { q: 'Q1', options: ['a', 'b', 'c', 'd'], answer: 0, explain: 'e1' },
  { q: 'Q2', options: ['a', 'b', 'c', 'd'], answer: 3, explain: 'e2' },
];

const attempt: Quiz = {
  id: 'q1', date: '2026-09-01T00:00:00.000Z', score: 1, total: 2,
  questions: qs, picks: [0, 1], source: 'offline',
};

describe('quizReducer', () => {
  it('moves from loading to asking with an empty pick slot per question', () => {
    const s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'offline' });
    expect(s.status).toBe('asking');
    expect(s.picks).toEqual([null, null]);
    expect(s.source).toBe('offline');
    expect(s.review).toBe(false);
  });

  it('records a pick and ignores a second pick for the same question', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'pick', index: 2 });
    expect(s.picks[0]).toBe(2);
    s = quizReducer(s, { type: 'pick', index: 0 });
    expect(s.picks[0]).toBe(2);
  });

  it('refuses to advance before the current question is answered', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(0);
    s = quizReducer(s, { type: 'pick', index: 0 });
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(1);
  });

  it('stays on the last question when next is pressed — the controller finishes instead', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'pick', index: 0 });
    s = quizReducer(s, { type: 'next' });
    s = quizReducer(s, { type: 'pick', index: 3 });
    s = quizReducer(s, { type: 'next' });
    expect(s.i).toBe(1);
    expect(s.status).toBe('asking');
  });

  it('ignores picks once the quiz is done', () => {
    let s = quizReducer(initialQuizState, { type: 'openReview', attempt });
    s = quizReducer(s, { type: 'pick', index: 2 });
    expect(s.picks).toEqual([0, 1]);
  });

  it('enters review mode from a stored attempt without changing picks', () => {
    const s = quizReducer(initialQuizState, { type: 'openReview', attempt });
    expect(s.status).toBe('done');
    expect(s.review).toBe(true);
    expect(s.i).toBe(1);
    expect(s.picks).toEqual([0, 1]);
    expect(s.attempt).toBe(attempt);
  });

  it('restart returns to the loading state', () => {
    const asking = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    expect(quizReducer(asking, { type: 'restart' })).toEqual(initialQuizState);
  });

  it('finish marks the run as complete and stores the attempt', () => {
    let s = quizReducer(initialQuizState, { type: 'loaded', questions: qs, source: 'ai' });
    s = quizReducer(s, { type: 'finish', attempt });
    expect(s.status).toBe('done');
    expect(s.review).toBe(false);
    expect(s.attempt).toBe(attempt);
  });
});

describe('scoreOf', () => {
  it('counts only exact matches and never trusts a stored score', () => {
    expect(scoreOf(qs, [0, 3])).toBe(2);
    expect(scoreOf(qs, [0, 1])).toBe(1);
    expect(scoreOf(qs, [null, null])).toBe(0);
  });
});

describe('avoidFrom', () => {
  it('collects the last ten previous question texts', () => {
    const many: Quiz[] = Array.from({ length: 4 }, (_, k) => ({
      ...attempt,
      id: `q${k}`,
      questions: qs.map((q) => ({ ...q, q: `${q.q}-${k}` })),
    }));
    const out = avoidFrom(many);
    expect(out).toHaveLength(8);
    expect(out.at(-1)).toBe('Q2-3');
  });

  it('is empty when there is no history', () => {
    expect(avoidFrom([])).toEqual([]);
  });
});
