import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { QuizQuestion } from './quiz-option';
import { QuizModal } from './quiz-modal';

const QUESTIONS: QuizQuestion[] = [
  { q: 'Liều adrenalin IM cho người lớn?', options: ['0,1 mg', '0,5 mg', '1 mg', '5 mg'], answer: 1, explain: 'Theo phác đồ.' },
  { q: 'Đường dùng?', options: ['IM', 'IV', 'SC', 'PO'], answer: 0, explain: 'Tiêm bắp.' },
];

function renderModal(overrides: Partial<ComponentProps<typeof QuizModal>> = {}) {
  const props: ComponentProps<typeof QuizModal> = {
    open: true,
    noteTitle: 'Xử trí sốc phản vệ',
    review: false,
    status: 'asking',
    questions: QUESTIONS,
    picks: [null, null],
    index: 0,
    isMobile: false,
    onPick: vi.fn(),
    onNext: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<QuizModal {...props} />);
  return props;
}

describe('QuizModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <QuizModal open={false} noteTitle="x" review={false} status="asking" questions={QUESTIONS}
        picks={[null, null]} index={0} isMobile={false}
        onPick={() => {}} onNext={() => {}} onRetry={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('covers the viewport at z95 on the app background', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Trắc nghiệm' });
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('bg-bg');
    expect(dialog.style.zIndex).toBe('95');
  });

  it('shows the heading, note title and a mono counter with the data-quiz-counter hook', () => {
    renderModal({ index: 1 });
    expect(screen.getByText('Trắc nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Xử trí sốc phản vệ')).toBeInTheDocument();
    const counter = screen.getByText('2 / 2');
    expect(counter.className).toContain('font-mono');
    expect(counter).toHaveAttribute('data-quiz-counter');
  });

  it('uses the review heading when replaying a stored attempt', () => {
    renderModal({ review: true, status: 'done', picks: [1, 0] });
    expect(screen.getByText('Kết quả trắc nghiệm')).toBeInTheDocument();
  });

  it('advances the 3px progress bar as questions are answered', () => {
    const { container } = render(
      <QuizModal open noteTitle="x" review={false} status="asking" questions={QUESTIONS}
        picks={[1, null]} index={0} isMobile={false}
        onPick={() => {}} onNext={() => {}} onRetry={() => {}} onClose={() => {}} />,
    );
    const fill = container.querySelector('[data-quiz-progress]') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('shows the loading state with the serif headline and skeleton bars', () => {
    renderModal({ status: 'loading' });
    expect(screen.getByText('Đang soạn câu hỏi…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Đang soạn câu hỏi…' })).toBeInTheDocument();
  });

  it('shows the question label and four options', () => {
    renderModal();
    expect(screen.getByText('CÂU 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Liều adrenalin IM cho người lớn?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /mg$/ })).toHaveLength(4);
  });

  it('picks by click and by the 1–4 keys, once per question', async () => {
    const onPick = vi.fn();
    renderModal({ onPick });
    await userEvent.keyboard('2');
    expect(onPick).toHaveBeenCalledWith(1);
    await userEvent.keyboard('4');
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it('ignores the number keys once the question is answered', async () => {
    const onPick = vi.fn();
    renderModal({ onPick, picks: [1, null] });
    await userEvent.keyboard('3');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows the feedback panel and enables the next button after answering', () => {
    renderModal({ picks: [1, null] });
    expect(screen.getByText('Chính xác')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Câu tiếp theo' })).not.toBeDisabled();
  });

  it('labels the last question button "Xem kết quả"', () => {
    renderModal({ index: 1, picks: [1, 0] });
    expect(screen.getByRole('button', { name: 'Xem kết quả' })).toBeInTheDocument();
  });

  it('advances on Enter once answered', async () => {
    const onNext = vi.fn();
    renderModal({ onNext, picks: [1, null] });
    await userEvent.keyboard('{Enter}');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on the 40px close button', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders the result view when done', () => {
    renderModal({ status: 'done', picks: [1, 0] });
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Xem lại đáp án')).toBeInTheDocument();
  });
});
