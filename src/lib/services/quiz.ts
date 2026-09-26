// src/lib/services/quiz.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { and, eq, ne } from 'drizzle-orm';
import { db, noteIndex } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { getStorage } from '@/lib/storage';
import { clip, sections, shuffle, stripHtml } from '@/lib/text';
import type { Note, Question } from '@/lib/types';
import { getNote } from './notes';

export const GEMINI_MODEL = 'gemini-2.0-flash';

/** Bộ sinh quiz offline — port NGUYÊN VĂN `offlineQuiz()` của prototype. */
export function offlineQuiz(n: Note, all: Note[]): Question[] {
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

  return qs.slice(0, 5);
}

/**
 * Prompt tiếng Việt — port NGUYÊN VĂN từ `startQuiz()` của prototype.
 * `avoid` do client truyền thêm (part-0 §3.6) được gộp với lịch sử của note,
 * khử trùng lặp, rồi lấy 10 câu gần nhất.
 */
export function buildPrompt(n: Note, avoid: string[] = []): string {
  const text = stripHtml(n.content);
  const history = (n.quizzes || []).flatMap((z) => z.questions.map((q) => q.q));
  const prev = [...new Set([...history, ...avoid])].slice(-10);
  return (
    'Bạn là giảng viên y khoa. Chỉ dựa vào ghi chú dưới đây, tạo 5 câu hỏi trắc nghiệm bằng tiếng Việt để bác sĩ tự ôn tập. ' +
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
export function parseAiQuestions(text: string): Question[] | null {
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
  return valid.slice(0, 5);
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

async function tryGemini(note: Note, avoid: string[]): Promise<Question[] | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(note, avoid) }] }],
      generationConfig: { maxOutputTokens: 2500, temperature: 0.7 },
    });
    return parseAiQuestions(res.response.text());
  } catch (e) {
    // Quota, network, safety block — all become "use the offline generator".
    console.warn('[quiz] gemini failed, falling back to offline:', (e as Error).message);
    return null;
  }
}

/**
 * Gemini trước, offline sau. KHÔNG BAO GIỜ ném vì lỗi LLM — chỉ ném 404 khi
 * không có note, và 422 NOT_ENOUGH_CONTENT khi không dựng nổi câu hỏi nào.
 * Hoạt động bình thường khi KHÔNG có GOOGLE_GENERATIVE_AI_API_KEY.
 */
export async function generateQuiz(
  userId: string,
  noteId: string,
  avoid: string[] = [],
): Promise<{ questions: Question[]; source: 'ai' | 'offline' }> {
  const note = await getNote(userId, noteId);

  const ai = await tryGemini(note, avoid);
  if (ai) return { questions: ai, source: 'ai' };

  const all = [note, ...(await otherNotes(userId, noteId))];
  const questions = offlineQuiz(note, all);
  if (!questions.length) {
    // part-0 §3.6: the UI turns this into the toast
    // "Ghi chú chưa đủ nội dung để tạo câu hỏi".
    throw new HttpError(422, 'NOT_ENOUGH_CONTENT', 'Ghi chú chưa đủ nội dung để tạo câu hỏi.');
  }
  return { questions, source: 'offline' };
}
