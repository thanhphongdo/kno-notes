import { describe, expect, it } from 'vitest';
import type { Question } from '@/lib/types';
import {
  QUIZ_LENGTH,
  QUIZ_LENGTH_CHOICES,
  clampQuizCount,
  countUsableQuestions,
  isUsableQuestion,
  quizLengthOptions,
} from './lengths';

const labels = (total: number) => quizLengthOptions(total).map((o) => o.label);
const values = (total: number) => quizLengthOptions(total).map((o) => o.value);

describe('QUIZ_LENGTH_CHOICES', () => {
  it('is 5, 10, 20', () => {
    expect([...QUIZ_LENGTH_CHOICES]).toEqual([5, 10, 20]);
  });
});

describe('quizLengthOptions', () => {
  it('bộ 15 câu: 5, 10 và toàn bộ — không có 20', () => {
    expect(values(15)).toEqual([5, 10, 15]);
    expect(labels(15)).toEqual(['5 câu', '10 câu', 'Toàn bộ (15 câu)']);
  });

  it('bộ 20 câu: không có mục "20 câu" riêng vì nó trùng toàn bộ', () => {
    expect(values(20)).toEqual([5, 10, 20]);
    expect(labels(20)).toEqual(['5 câu', '10 câu', 'Toàn bộ (20 câu)']);
  });

  it('bộ 21 câu: đủ cả ba mốc cộng toàn bộ', () => {
    expect(values(21)).toEqual([5, 10, 20, 21]);
    expect(labels(21).at(-1)).toBe('Toàn bộ (21 câu)');
  });

  it('bộ 3 câu: không có lựa chọn nào, vào thẳng bài', () => {
    expect(quizLengthOptions(3)).toEqual([]);
  });

  it('bộ đúng 5 câu: cũng không hỏi, vì chỉ còn mỗi "toàn bộ"', () => {
    expect(quizLengthOptions(5)).toEqual([]);
  });

  it('bộ rỗng, số âm, số không nguyên, NaN', () => {
    expect(quizLengthOptions(0)).toEqual([]);
    expect(quizLengthOptions(-7)).toEqual([]);
    expect(values(10.5)).toEqual([5, 10]);
    expect(labels(10.5).at(-1)).toBe('Toàn bộ (10 câu)');
    expect(quizLengthOptions(Number.NaN)).toEqual([]);
  });

  it('mục cuối luôn bằng tổng số câu dùng được', () => {
    for (const total of [6, 11, 21, 40]) {
      expect(quizLengthOptions(total).at(-1)!.value).toBe(total);
    }
  });
});

describe('clampQuizCount', () => {
  it('giữ nguyên số hợp lệ', () => {
    expect(clampQuizCount(10, 15)).toBe(10);
    expect(clampQuizCount(15, 15)).toBe(15);
  });

  it('kẹp xuống tổng và lên 1', () => {
    expect(clampQuizCount(999, 15)).toBe(15);
    expect(clampQuizCount(0, 15)).toBe(1);
    expect(clampQuizCount(-20, 15)).toBe(1);
  });

  it('cắt phần thập phân', () => {
    expect(clampQuizCount(7.9, 15)).toBe(7);
    expect(clampQuizCount(1.5, 15)).toBe(1);
  });

  it('số rác rơi về mặc định, vẫn không vượt tổng', () => {
    expect(clampQuizCount(Number.NaN, 15)).toBe(QUIZ_LENGTH);
    expect(clampQuizCount(Number.POSITIVE_INFINITY, 15)).toBe(QUIZ_LENGTH);
    expect(clampQuizCount(Number.NaN, 3)).toBe(3);
  });

  it('tổng rác vẫn trả về ít nhất 1 câu', () => {
    expect(clampQuizCount(10, 0)).toBe(1);
    expect(clampQuizCount(10, -5)).toBe(1);
    expect(clampQuizCount(10, Number.NaN)).toBe(1);
  });
});

const ok: Question = { q: 'Liều adrenalin?', options: ['a', 'b', 'c', 'd'], answer: 1, explain: '' };

describe('isUsableQuestion / countUsableQuestions', () => {
  it('nhận câu đủ đề, đủ 4 lựa chọn, đáp án nằm trong 4 lựa chọn', () => {
    expect(isUsableQuestion(ok)).toBe(true);
  });

  it('loại câu thiếu đề, sai số lựa chọn hoặc đáp án ngoài khoảng', () => {
    expect(isUsableQuestion({ ...ok, q: '   ' })).toBe(false);
    expect(isUsableQuestion({ ...ok, options: ['a', 'b', 'c'] })).toBe(false);
    expect(isUsableQuestion({ ...ok, answer: 4 })).toBe(false);
    expect(isUsableQuestion({ ...ok, answer: 1.5 })).toBe(false);
    expect(isUsableQuestion(null)).toBe(false);
    expect(isUsableQuestion(undefined)).toBe(false);
  });

  it('đếm được số câu dùng được, kể cả khi ghi chú chưa có bộ câu hỏi', () => {
    expect(countUsableQuestions(undefined)).toBe(0);
    expect(countUsableQuestions([])).toBe(0);
    expect(countUsableQuestions([ok, { ...ok, answer: 9 }, ok])).toBe(2);
  });
});
