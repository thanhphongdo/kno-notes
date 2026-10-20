// src/lib/quiz/lengths.ts
import type { Question } from '@/lib/types';

/** Số câu mỗi lần làm bài khi người dùng không chọn gì. */
export const QUIZ_LENGTH = 5;

/** Các mốc số câu cố định được chào ra, trước khi thêm mục "Toàn bộ". */
export const QUIZ_LENGTH_CHOICES = [5, 10, 20] as const;

export interface QuizLengthOption {
  value: number;
  label: string;
}

/**
 * Một câu hỏi chỉ dùng được khi nó thật sự hỏi được: có đề, đúng 4 lựa chọn,
 * và chỉ số đáp án nằm trong 4 lựa chọn đó. Bộ câu hỏi soạn sẵn đến từ API
 * nên phải coi là dữ liệu lạ cho tới khi kiểm.
 *
 * Nằm ở module thuần này vì cả màn hình chọn số câu (client) lẫn bộ sinh đề
 * (server) đều phải đếm theo CÙNG một định nghĩa; `services/quiz.ts` kéo theo
 * db + storage nên client không import được.
 */
export function isUsableQuestion(q: Question | undefined | null): q is Question {
  return (
    Boolean(q) &&
    typeof q!.q === 'string' &&
    q!.q.trim().length > 0 &&
    Array.isArray(q!.options) &&
    q!.options.length === 4 &&
    Number.isInteger(q!.answer) &&
    q!.answer >= 0 &&
    q!.answer < 4
  );
}

export function countUsableQuestions(
  questions: readonly (Question | undefined | null)[] | undefined | null,
): number {
  return (questions ?? []).filter(isUsableQuestion).length;
}

/** Tổng số câu luôn được đọc thành một số nguyên không âm trước khi tính. */
function safeTotal(total: number): number {
  return Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
}

/**
 * Danh sách lựa chọn số câu cho một bộ đề `total` câu.
 *
 * Một mốc chỉ xuất hiện khi nó NHỎ HƠN HẲN tổng: bộ 20 câu thì "20 câu" trùng
 * với "Toàn bộ", chào cả hai là bắt người dùng chọn giữa hai thứ giống nhau.
 * Khi không mốc nào lọt (bộ ≤ 5 câu) thì chỉ còn mỗi "Toàn bộ" — không phải
 * một lựa chọn — nên trả về rỗng để caller vào thẳng bài.
 */
export function quizLengthOptions(total: number): QuizLengthOption[] {
  const max = safeTotal(total);
  const fixed = QUIZ_LENGTH_CHOICES.filter((n) => n < max);
  if (!fixed.length) return [];
  return [
    ...fixed.map((n) => ({ value: n, label: `${n} câu` })),
    { value: max, label: `Toàn bộ (${max} câu)` },
  ];
}

/**
 * Kẹp số câu người dùng xin về khoảng dùng được `[1, total]`.
 *
 * Số rác (NaN, vô cực) rơi về mặc định chứ không về `total`: client hỏng hoặc
 * client giả không nên kéo được bộ sinh đề chạy hết cỡ.
 */
export function clampQuizCount(count: number, total: number): number {
  const max = Math.max(1, safeTotal(total));
  if (!Number.isFinite(count)) return Math.min(QUIZ_LENGTH, max);
  return Math.min(max, Math.max(1, Math.floor(count)));
}
