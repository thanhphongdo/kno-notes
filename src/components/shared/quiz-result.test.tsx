import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuizResult, quizPercent, quizScore, quizVerdict } from './quiz-result';
import type { QuizQuestion } from './quiz-option';

const QUESTIONS: QuizQuestion[] = [
  { q: 'Liều adrenalin IM?', options: ['0,1 mg', '0,5 mg', '1 mg', '5 mg'], answer: 1, explain: 'Theo phác đồ.' },
  { q: 'Đường dùng?', options: ['IM', 'IV', 'SC', 'PO'], answer: 0, explain: 'Tiêm bắp.' },
];

describe('quiz scoring', () => {
  it('counts only exact matches', () => {
    expect(quizScore(QUESTIONS, [1, 0])).toBe(2);
    expect(quizScore(QUESTIONS, [1, 3])).toBe(1);
    expect(quizScore(QUESTIONS, [null, null])).toBe(0);
  });

  it('returns 0% instead of NaN for a zero-question quiz', () => {
    expect(quizPercent(0, 0)).toBe(0);
    expect(quizPercent(4, 5)).toBe(80);
  });

  it('uses the spec thresholds for the verdict', () => {
    expect(quizVerdict(100)).toBe('Nắm vững');
    expect(quizVerdict(80)).toBe('Nắm vững');
    expect(quizVerdict(79)).toBe('Cần ôn thêm');
    expect(quizVerdict(50)).toBe('Cần ôn thêm');
    expect(quizVerdict(49)).toBe('Nên đọc lại ghi chú');
  });
});

describe('QuizResult', () => {
  it('renders the 64px serif score and the coloured verdict', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={() => {}} onClose={() => {}} />);
    const score = screen.getByText('2/2');
    expect(score.className).toContain('font-serif');
    expect(score.className).toContain('text-64');
    expect(screen.getByText('100% · Nắm vững').className).toContain('text-ok');
  });

  it('uses "Hoàn thành" for a fresh run and "Lần làm bài" in review mode', () => {
    const { rerender } = render(
      <QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText('Hoàn thành').className).toContain('uppercase');
    rerender(<QuizResult questions={QUESTIONS} picks={[1, 0]} review onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Lần làm bài')).toBeInTheDocument();
  });

  it('lists every question with a ✓ or ✕ circle and the chosen answer', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 3]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('1. Liều adrenalin IM?')).toBeInTheDocument();
    expect(screen.getByText('2. Đường dùng?')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
    expect(screen.getByText('B. 0,5 mg')).toBeInTheDocument();
  });

  it('shows the correct answer only for wrong rows', () => {
    render(<QuizResult questions={QUESTIONS} picks={[1, 3]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText(/Đáp án đúng:/)).toHaveLength(1);
  });

  it('renders an em dash when a question was never answered', () => {
    render(<QuizResult questions={QUESTIONS} picks={[null, null]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('survives a zero-question quiz without NaN', () => {
    render(<QuizResult questions={[]} picks={[]} review={false} onRetry={() => {}} onClose={() => {}} />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByText('0% · Nên đọc lại ghi chú')).toBeInTheDocument();
  });

  it('offers both 42px actions', async () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(<QuizResult questions={QUESTIONS} picks={[1, 0]} review={false} onRetry={onRetry} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Làm bộ câu hỏi mới' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Về ghi chú' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
