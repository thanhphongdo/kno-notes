import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { Question, Quiz } from '@/lib/types';
import { QuizController } from './quiz-controller';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const questions: Question[] = Array.from({ length: 2 }, (_, i) => ({
  q: `Câu ${i + 1}`,
  options: ['a', 'b', 'c', 'd'],
  answer: 0,
  explain: `giải thích ${i + 1}`,
}));

const stored: Quiz = {
  id: 'a1', date: '2026-09-01T10:00:00.000Z', score: 1, total: 2,
  questions, picks: [0, 1], source: 'offline',
};

function setup(props?: Partial<React.ComponentProps<typeof QuizController>>) {
  const onClose = vi.fn();
  const view = render(
    <ToastProvider>
      <QuizController
        noteId="n1"
        noteTitle="Sốc phản vệ"
        attempts={[]}
        reviewAttemptId={null}
        onClose={onClose}
        {...props}
      />
    </ToastProvider>,
  );
  return { ...view, onClose };
}

const okQuestions = () => ({ ok: true, status: 200, json: async () => ({ questions, source: 'offline' }) });

describe('QuizController', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.unstubAllGlobals();
  });

  it('shows the loading screen first and asks the generator to avoid past questions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okQuestions());
    vi.stubGlobal('fetch', fetchMock);
    setup({ attempts: [stored] });

    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
    await screen.findByText('Câu 1');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/notes/n1/quiz/generate');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      avoid: string[];
    };
    expect(body.avoid).toEqual(['Câu 1', 'Câu 2']);
  });

  it('discards a late generate response when the modal is closed while loading', async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((r) => { resolve = r; })));
    const user = userEvent.setup();
    const { onClose } = setup();

    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    resolve(okQuestions());
    await new Promise((r) => setTimeout(r, 10));

    expect(screen.queryByText('Câu 1')).toBeNull();
    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
  });

  it('locks the answer after the first pick and reveals the feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okQuestions()));
    const user = userEvent.setup();
    setup();
    await screen.findByText('Câu 1');

    await user.keyboard('2');
    expect(await screen.findByText('Chưa đúng — đáp án là A')).toBeInTheDocument();
    await user.keyboard('1');
    expect(screen.getByText('Chưa đúng — đáp án là A')).toBeInTheDocument();
    expect(document.querySelector('[data-quiz-feedback][data-correct="false"]')).not.toBeNull();
  });

  it('walks the whole run with the keyboard, records the attempt and shows the result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okQuestions())
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ quiz: { ...stored, id: 'new', score: 1, picks: [0, 1] } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    setup();
    await screen.findByText('Câu 1');

    await user.keyboard('1');
    await user.keyboard('{Enter}');
    await screen.findByText('Câu 2');
    await user.keyboard('2');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/notes/n1/quizzes');
    const saved = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string) as {
      score: number; total: number; picks: number[];
    };
    // Score is recomputed from picks vs answers, never taken on trust.
    expect(saved).toMatchObject({ score: 1, total: 2, picks: [0, 1] });
    expect(await screen.findByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('50% · Cần ôn thêm')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('opens a stored attempt in review mode without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setup({ attempts: [stored], reviewAttemptId: 'a1' });
    await waitFor(() => expect(screen.getByText('Lần làm bài')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('toasts and closes when the note has too little content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: { code: 'NOT_ENOUGH_CONTENT', message: 'x' } }),
      }),
    );
    const { onClose } = setup();
    expect(await screen.findByText('Ghi chú chưa đủ nội dung để tạo câu hỏi')).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('regenerates a fresh set from the result screen', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okQuestions())
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ quiz: stored }) })
      .mockResolvedValueOnce(okQuestions());
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    setup();
    await screen.findByText('Câu 1');
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    await screen.findByText('Câu 2');
    await user.keyboard('1');
    await user.keyboard('{Enter}');

    await user.click(await screen.findByRole('button', { name: 'Làm bộ câu hỏi mới' }));
    await screen.findByText('Câu 1');
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/notes/n1/quiz/generate');
  });
});
