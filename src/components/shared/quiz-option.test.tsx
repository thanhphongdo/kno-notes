import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuizOption, quizOptionState } from './quiz-option';
import { QuizFeedback } from './quiz-feedback';

describe('quizOptionState', () => {
  it('is idle before an answer', () => {
    expect(quizOptionState({ answered: false, isAnswer: true, isPicked: false })).toBe('idle');
    expect(quizOptionState({ answered: false, isAnswer: false, isPicked: false })).toBe('idle');
  });

  it('marks the correct answer, the wrong pick, and dims the rest', () => {
    expect(quizOptionState({ answered: true, isAnswer: true, isPicked: false })).toBe('ok');
    expect(quizOptionState({ answered: true, isAnswer: true, isPicked: true })).toBe('ok');
    expect(quizOptionState({ answered: true, isAnswer: false, isPicked: true })).toBe('bad');
    expect(quizOptionState({ answered: true, isAnswer: false, isPicked: false })).toBe('dim');
  });
});

describe('QuizOption', () => {
  it('shows the mono 26px key box and the 16px text', () => {
    render(<QuizOption letter="A" text="0,5 mg tiêm bắp" state="idle" answered={false} onPick={() => {}} />);
    const key = screen.getByText('A');
    expect(key.className).toContain('h-26');
    expect(key.className).toContain('w-26');
    expect(key.className).toContain('rounded-7');
    expect(key.className).toContain('font-mono');
    expect(screen.getByRole('button').className).toContain('text-16');
  });

  it('emits data-quiz-option and data-state', () => {
    render(<QuizOption letter="A" text="x" state="dim" answered onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el).toHaveAttribute('data-quiz-option');
    expect(el).toHaveAttribute('data-state', 'dim');
  });

  it('uses the idle frame: 1px --line, --surface, r12, py14 px16, gap 14', () => {
    render(<QuizOption letter="A" text="x" state="idle" answered={false} onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-line');
    expect(el.className).toContain('bg-surface');
    expect(el.className).toContain('rounded-12');
    expect(el.className).toContain('py-14');
    expect(el.className).toContain('px-16');
    expect(el.className).toContain('gap-14');
  });

  it('paints the correct option ok and labels it "Đúng"', () => {
    render(<QuizOption letter="B" text="x" state="ok" answered onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-ok');
    expect(el.className).toContain('bg-ok-soft');
    expect(screen.getByText('Đúng')).toBeInTheDocument();
  });

  it('paints the wrong pick hi and labels it "Sai"', () => {
    render(<QuizOption letter="C" text="x" state="bad" answered onPick={() => {}} />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('border-hi');
    expect(el.className).toContain('bg-hi-soft');
    expect(screen.getByText('Sai')).toBeInTheDocument();
  });

  it('leaves unpicked options neutral and unlabelled', () => {
    render(<QuizOption letter="D" text="x" state="dim" answered onPick={() => {}} />);
    expect(screen.queryByText('Đúng')).toBeNull();
    expect(screen.queryByText('Sai')).toBeNull();
  });

  it('is pickable once and disabled afterwards', async () => {
    const onPick = vi.fn();
    const { rerender } = render(<QuizOption letter="A" text="x" state="idle" answered={false} onPick={onPick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
    rerender(<QuizOption letter="A" text="x" state="dim" answered onPick={onPick} />);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('QuizFeedback', () => {
  it('congratulates a correct pick', () => {
    const { container } = render(<QuizFeedback correct answerLetter="B" explain="Theo phác đồ." />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('data-quiz-feedback');
    expect(el).toHaveAttribute('data-correct', 'true');
    expect(el.className).toContain('bg-ok-soft');
    expect(screen.getByText('Chính xác')).toBeInTheDocument();
    expect(screen.getByText('Theo phác đồ.')).toBeInTheDocument();
  });

  it('names the right answer for a wrong pick', () => {
    const { container } = render(<QuizFeedback correct={false} answerLetter="B" explain="" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('data-correct', 'false');
    expect(el.className).toContain('bg-hi-soft');
    expect(screen.getByText('Chưa đúng — đáp án là B')).toBeInTheDocument();
  });
});
