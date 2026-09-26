import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from './note-card';
import { NoteListRow } from './note-list-row';

const NOTE: NoteSummary = {
  id: 'n2',
  title: 'Thang điểm Glasgow (GCS)',
  desc: 'Cách chấm điểm nhanh tại giường.',
  priority: 'high',
  tags: ['Thần kinh', 'Cấp cứu'],
  favorite: true,
  updatedLabel: 'vừa xong',
  version: 1,
  imageCount: 0,
  commentCount: 2,
};

describe('NoteListRow', () => {
  it('uses the row frame: 16/18 padding, gap 16, top hairline', () => {
    const { container } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('py-16');
    expect(row.className).toContain('px-18');
    expect(row.className).toContain('gap-16');
    expect(row.className).toContain('border-t');
    expect(row.className).toContain('border-line');
  });

  it('emits the data-note-row / data-note-id / data-note-title hooks', () => {
    const { container } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute('data-note-row');
    expect(row).toHaveAttribute('data-note-id', 'n2');
    expect(row.querySelector('[data-note-title]')).toHaveTextContent('Thang điểm Glasgow (GCS)');
  });

  it('makes the first row top border transparent', () => {
    const { container } = render(<NoteListRow note={NOTE} first onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('border-transparent');
  });

  it('renders the serif 17px title and 13px description, both ellipsised', () => {
    render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    const title = screen.getByText('Thang điểm Glasgow (GCS)');
    expect(title.className).toContain('font-serif');
    expect(title.className).toContain('text-17');
    expect(title.className).toContain('truncate');
    expect(screen.getByText('Cách chấm điểm nhanh tại giường.').className).toContain('truncate');
  });

  it('shows the 8px priority dot', () => {
    const { container } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(container.querySelector('.bg-hi')).not.toBeNull();
  });

  it('wraps on mobile only when asked', () => {
    const { container, rerender } = render(<NoteListRow note={NOTE} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('flex-nowrap');
    rerender(<NoteListRow note={NOTE} wrap onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('flex-wrap');
  });

  it('renders a link when href is supplied', () => {
    const { container } = render(<NoteListRow note={NOTE} href="/notes/n2" onToggleFavorite={() => {}} />);
    const link = container.firstElementChild as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/notes/n2');
    expect(link).toHaveAttribute('data-note-row');
  });

  it('toggles favourite without opening', async () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    render(<NoteListRow note={NOTE} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('n2');
    expect(onOpen).not.toHaveBeenCalled();
  });
});
