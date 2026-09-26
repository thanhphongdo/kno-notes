import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteCard, type NoteSummary } from './note-card';

const NOTE: NoteSummary = {
  id: 'n1',
  title: 'Đọc ECG trong 10 bước',
  desc: 'Loại trừ 5 nguyên nhân nguy hiểm…',
  priority: 'medium',
  tags: ['Tim mạch', 'Cấp cứu', 'Nội khoa', 'Thừa'],
  favorite: false,
  updatedLabel: '3 ngày trước',
  version: 3,
  imageCount: 2,
  commentCount: 1,
};

describe('NoteCard', () => {
  it('uses the card frame: surface, 1px line, r14, 18/20/16 padding, min-h 200', () => {
    const { container } = render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('bg-surface');
    expect(card.className).toContain('border-line');
    expect(card.className).toContain('rounded-14');
    expect(card.className).toContain('pt-18');
    expect(card.className).toContain('px-20');
    expect(card.className).toContain('pb-16');
    expect(card.className).toContain('min-h-200');
    expect(card.className).toContain('gap-10');
  });

  it('emits the data-note-card / data-note-id / data-note-title hooks', () => {
    const { container } = render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('data-note-card');
    expect(card).toHaveAttribute('data-note-id', 'n1');
    expect(card.querySelector('[data-note-title]')).toHaveTextContent('Đọc ECG trong 10 bước');
  });

  it('renders the serif 20px title and the 2-line clamped description', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const title = screen.getByText('Đọc ECG trong 10 bước');
    expect(title.className).toContain('font-serif');
    expect(title.className).toContain('text-20');
    expect(screen.getByText('Loại trừ 5 nguyên nhân nguy hiểm…').className).toContain('line-clamp-2');
  });

  it('shows the priority label and at most three tags', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('Trung bình')).toBeInTheDocument();
    expect(screen.getByText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByText('Nội khoa')).toBeInTheDocument();
    expect(screen.queryByText('Thừa')).toBeNull();
  });

  it('shows the footer meta: relative time, image count, comment count, mono version', () => {
    render(<NoteCard note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('3 ngày trước')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('v3').className).toContain('font-mono');
  });

  it('hides image and comment counters when they are zero', () => {
    render(
      <NoteCard note={{ ...NOTE, imageCount: 0, commentCount: 0 }} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    expect(screen.queryByLabelText('Số hình ảnh')).toBeNull();
    expect(screen.queryByLabelText('Số bình luận')).toBeNull();
  });

  it('opens the note when the card body is clicked', async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={() => {}} />);
    await userEvent.click(screen.getByText('Đọc ECG trong 10 bước'));
    expect(onOpen).toHaveBeenCalledWith('n1');
  });

  it('renders a real link when href is supplied, with the same classes and hooks', () => {
    const { container } = render(
      <NoteCard note={NOTE} href="/notes/n1" onToggleFavorite={() => {}} />,
    );
    const link = container.firstElementChild as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/notes/n1');
    expect(link).toHaveAttribute('data-note-card');
    expect(link).toHaveAttribute('data-note-id', 'n1');
    expect(link.className).toContain('rounded-14');
    expect(link.className).toContain('min-h-200');
  });

  it('toggles favourite without opening the note', async () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('n1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('marks the star pressed and tinted when favourited', () => {
    render(<NoteCard note={{ ...NOTE, favorite: true }} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const star = screen.getByRole('button', { name: 'Yêu thích' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(star.className).toContain('text-med');
  });

  it('never lets an unbreakable title widen the card', () => {
    render(<NoteCard note={{ ...NOTE, title: 'a'.repeat(120) }} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('a'.repeat(120)).className).toContain('break-words');
  });

  it('opens the note when Enter is pressed on the card', async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={NOTE} onOpen={onOpen} onToggleFavorite={() => {}} />);
    screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('n1');
  });
});
