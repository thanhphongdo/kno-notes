// src/lib/services/quiz.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { and, eq, ne } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { getStorage } from '@/lib/storage';
import {
  QUIZ_LENGTH,
  clampQuizCount,
  countUsableQuestions,
  isUsableQuestion,
} from '@/lib/quiz/lengths';
import { clip, shuffle } from '@/lib/text';
import { sections, stripHtml } from '@/lib/text/server';
import type { Note, Question, QuizSource } from '@/lib/types';
import { getNote } from './notes';

export const GEMINI_MODEL = 'gemini-2.0-flash';

// Định nghĩa đã dọn sang module thuần để màn hình chọn số câu dùng lại được;
// vẫn xuất lại ở đây vì phía server quen gọi qua service này.
export { QUIZ_LENGTH, isUsableQuestion };

/** Số câu xin được, đọc thành số nguyên ≥ 1; số rác về mặc định. */
function asCount(count: number): number {
  return Number.isFinite(count) ? Math.max(1, Math.floor(count)) : QUIZ_LENGTH;
}

/**
 * Đảo vị trí bốn lựa chọn, `answer` đi theo đáp án đúng.
 *
 * Đảo theo CHỈ SỐ chứ không tìm lại đáp án bằng `indexOf` trên chuỗi: hai lựa
 * chọn trùng chữ sẽ làm `indexOf` trỏ nhầm cái đầu tiên.
 */
export function shuffleQuestion(q: Question): Question {
  const order = shuffle(q.options.map((_, i) => i));
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
  };
}

/**
 * Một đề lấy từ bộ câu hỏi soạn sẵn của ghi chú.
 *
 * Soạn sẵn không có nghĩa là lần nào cũng y hệt: thứ tự câu được xáo, bộ nào
 * nhiều hơn số câu cần thì mỗi lần rút một tổ hợp khác, và bốn lựa chọn của
 * mỗi câu luôn được đảo. Nội dung câu hỏi thì không đổi — đó chính là điểm
 * của việc soạn trước.
 */
export function bankQuiz(note: Note, count: number = QUIZ_LENGTH): Question[] {
  const bank = (note.questions ?? []).filter(isUsableQuestion);
  if (!bank.length) return [];
  return shuffle(bank).slice(0, clampQuizCount(count, bank.length)).map(shuffleQuestion);
}

/** Bộ sinh quiz offline — port NGUYÊN VĂN `offlineQuiz()` của prototype. */
export function offlineQuiz(n: Note, all: Note[], count: number = QUIZ_LENGTH): Question[] {
  const secs = sections(n.content);
  const qs: Question[] = [];

  const foreign = shuffle(
    all.filter((x) => x.id !== n.id).flatMap((x) => sections(x.content).flatMap((s) => s.items)),
  );

  shuffle(secs).forEach((s) => {
    const right = s.items[Math.floor(Math.random() * s.items.length)];
    const own = secs.filter((o) => o !== s).flatMap((o) => o.items);
    const wrong = shuffle([...own])
      .concat(foreign)
      .filter((x) => x !== right && !s.items.includes(x))
      .filter((x, i, a) => a.indexOf(x) === i)
      .slice(0, 3);
    if (wrong.length < 3) return;

    const opts = shuffle([right, ...wrong]);
    qs.push({
      q: 'Theo ghi chú, nội dung nào dưới đây thuộc mục “' + s.h + '”?',
      options: opts.map((o) => clip(o)),
      answer: opts.indexOf(right),
      explain: 'Mục “' + s.h + '” ghi: ' + clip(right, 220),
    });
  });

  const otherTags = shuffle(
    [...new Set(all.flatMap((x) => x.tags))].filter((t) => !n.tags.includes(t)),
  );
  if (otherTags.length >= 3 && n.tags.length) {
    const opts = shuffle([n.tags[0], ...otherTags.slice(0, 3)]);
    qs.push({
      q: 'Ghi chú “' + n.title + '” thuộc chủ đề nào?',
      options: opts,
      answer: opts.indexOf(n.tags[0]),
      explain: 'Ghi chú được gắn thẻ: ' + n.tags.join(', ') + '.',
    });
  }

  return qs.slice(0, asCount(count));
}

/**
 * Prompt tiếng Việt — port NGUYÊN VĂN từ `startQuiz()` của prototype.
 * `avoid` do client truyền thêm (part-0 §3.6) được gộp với lịch sử của note,
 * khử trùng lặp, rồi lấy 10 câu gần nhất.
 */
export function buildPrompt(n: Note, avoid: string[] = [], count: number = QUIZ_LENGTH): string {
  const text = stripHtml(n.content);
  const history = (n.quizzes || []).flatMap((z) => z.questions.map((q) => q.q));
  const prev = [...new Set([...history, ...avoid])].slice(-10);
  return (
    'Bạn là giảng viên y khoa. Chỉ dựa vào ghi chú dưới đây, tạo ' +
    asCount(count) +
    ' câu hỏi trắc nghiệm bằng tiếng Việt để bác sĩ tự ôn tập. ' +
    'Mỗi câu có đúng 4 lựa chọn ngắn gọn, 1 đáp án đúng, các phương án sai phải hợp lý. Xáo trộn vị trí đáp án đúng. ' +
    (prev.length ? 'Tránh lặp lại các câu: ' + prev.join(' | ') + '. ' : '') +
    'Chỉ trả về JSON array, không thêm chữ nào khác: ' +
    '[{"q":"...","options":["...","...","...","..."],"answer":0,"explain":"giải thích 1–2 câu"}]\n\n' +
    'TIÊU ĐỀ: ' +
    n.title +
    '\nMÔ TẢ: ' +
    n.desc +
    '\nNỘI DUNG: ' +
    text
  );
}

interface RawQuestion {
  q?: unknown;
  options?: unknown;
  answer?: unknown;
  explain?: unknown;
}

/**
 * Trích + kiểm tra JSON từ câu trả lời của LLM.
 * Trả null nếu còn dưới 3 câu hợp lệ => caller rơi về offline.
 */
export function parseAiQuestions(text: string, count: number = QUIZ_LENGTH): Question[] | null {
  const match = (text || '').match(/\[[\s\S]*\]/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const valid = (parsed as RawQuestion[])
    .filter(
      (q): q is RawQuestion =>
        Boolean(q) &&
        typeof q.q === 'string' &&
        q.q.trim().length > 0 &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.answer === 'number' &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < 4,
    )
    .map<Question>((q) => ({
      q: String(q.q).trim(),
      options: (q.options as unknown[]).map((o) => String(o)),
      answer: q.answer as number,
      explain: typeof q.explain === 'string' ? q.explain : '',
    }));

  if (valid.length < 3) return null;
  return valid.slice(0, asCount(count));
}

/** Nguồn câu hỏi sai cho quiz offline: các note khác của CHÍNH user này. */
async function otherNotes(userId: string, noteId: string): Promise<Note[]> {
  const rows = await db
    .select({ noteId: noteIndex.noteId })
    .from(noteIndex)
    .where(and(eq(noteIndex.userId, userId), ne(noteIndex.noteId, noteId)))
    .limit(40);

  const storage = getStorage();
  const loaded = await Promise.all(rows.map((r) => storage.readNote(userId, r.noteId)));
  return loaded.filter((n): n is Note => n !== null);
}

async function tryGemini(
  note: Note,
  avoid: string[],
  count: number = QUIZ_LENGTH,
): Promise<Question[] | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(note, avoid, count) }] }],
      // Đề dài cần thêm chỗ để trả lời, nếu không JSON bị cắt giữa câu.
      generationConfig: {
        maxOutputTokens: Math.min(8192, Math.max(2500, 500 * asCount(count))),
        temperature: 0.7,
      },
    });
    return parseAiQuestions(res.response.text(), count);
  } catch (e) {
    // Quota, network, safety block — all become "use the offline generator".
    console.warn('[quiz] gemini failed, falling back to offline:', (e as Error).message);
    return null;
  }
}

/**
 * Ba nguồn, theo thứ tự: Gemini → bộ soạn sẵn → bộ sinh tự động.
 *
 * Gemini đứng trước vì nó chỉ chạy khi người dùng CHỦ ĐỘNG cắm API key; có
 * key nghĩa là muốn dùng AI. Không có key, hoặc AI lỗi/hết quota, thì bộ câu
 * hỏi soạn sẵn của ghi chú là thứ tốt nhất còn lại — người viết ra nó biết
 * mình muốn hỏi gì. Bộ sinh tự động chỉ là lưới an toàn cuối cùng cho những
 * ghi chú chưa ai soạn câu hỏi.
 *
 * KHÔNG BAO GIỜ ném vì lỗi LLM — chỉ ném 404 khi không có note, và 422
 * NOT_ENOUGH_CONTENT khi không dựng nổi câu hỏi nào từ bất kỳ nguồn nào.
 */
export async function generateQuiz(
  userId: string,
  noteId: string,
  avoid: string[] = [],
  count?: number,
): Promise<{ questions: Question[]; source: QuizSource }> {
  const note = await getNote(userId, noteId);

  /*
   * Màn hình chọn số câu chỉ chào tối đa bằng bộ câu hỏi soạn sẵn, nên trần ở
   * đây cũng là bộ đó — client gửi số to hơn thì không kéo nổi Gemini hay bộ
   * sinh tự động chạy quá cỡ. Ghi chú chưa soạn câu hỏi thì trần là mặc định.
   */
  const limit = Math.max(countUsableQuestions(note.questions), QUIZ_LENGTH);
  const n = clampQuizCount(count ?? QUIZ_LENGTH, limit);

  const ai = await tryGemini(note, avoid, n);
  if (ai) return { questions: ai, source: 'ai' };

  const bank = bankQuiz(note, n);
  if (bank.length) return { questions: bank, source: 'bank' };

  const all = [note, ...(await otherNotes(userId, noteId))];
  const questions = offlineQuiz(note, all, n);
  if (!questions.length) {
    // part-0 §3.6: the UI turns this into the toast
    // "Ghi chú chưa đủ nội dung để tạo câu hỏi".
    throw new HttpError(422, 'NOT_ENOUGH_CONTENT', 'Ghi chú chưa đủ nội dung để tạo câu hỏi.');
  }
  return { questions, source: 'offline' };
}
