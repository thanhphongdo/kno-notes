import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QUIZ_HISTORY_EMPTY, QuizHistoryList, scoreToneClass } from './quiz-history-list';

describe('scoreToneClass', () => {
  it('uses ok / med / hi at the 80 and 50 thresholds', () => {
    expect(scoreToneClass(100)).toBe('bg-ok');
    expect(scoreToneClass(80)).toBe('bg-ok');
    expect(scoreToneClass(79)).toBe('bg-med');
    expect(scoreToneClass(50)).toBe('bg-med');
    expect(scoreToneClass(49)).toBe('bg-hi');
    expect(scoreToneClass(0)).toBe('bg-hi');
  });
});

describe('QuizHistoryList', () => {
  it('shows the empty prompt', () => {
    render(<QuizHistoryList entries={[]} onOpen={() => {}} />);
    expect(screen.getByText(QUIZ_HISTORY_EMPTY)).toBeInTheDocument();
  });

  it('renders the mono score, percentage and a proportional bar', () => {
    const { container } = render(
      <QuizHistoryList entries={[{ id: 'q1', score: 4, total: 5, dateLabel: '2 giờ trước' }]} onOpen={() => {}} />,
    );
    expect(screen.getByText('4/5').className).toContain('font-mono');
    expect(screen.getByText(/· 80%/)).toBeInTheDocument();
    const fill = container.querySelector('.bg-ok') as HTMLElement;
    expect(fill.style.width).toBe('80%');
    expect(container.querySelector('[data-quiz-history-item]')).not.toBeNull();
  });

  it('never divides by zero for a 0-question attempt', () => {
    const { container } = render(
      <QuizHistoryList entries={[{ id: 'q1', score: 0, total: 0, dateLabel: 'vừa xong' }]} onOpen={() => {}} />,
    );
    expect(screen.getByText(/· 0%/)).toBeInTheDocument();
    expect((container.querySelector('.bg-hi') as HTMLElement).style.width).toBe('0%');
  });

  it('opens an attempt by id', async () => {
    const onOpen = vi.fn();
    render(<QuizHistoryList entries={[{ id: 'q1', score: 3, total: 5, dateLabel: 'hôm qua' }]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('q1');
  });
});
