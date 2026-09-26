import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NoteSummary } from './note-card';
import { NoteGrid } from './note-grid';
import { NoteList } from './note-list';

const make = (id: string, title: string): NoteSummary => ({
  id, title, desc: 'mô tả', priority: 'low', tags: [], favorite: false,
  updatedLabel: 'vừa xong', version: 1, imageCount: 0, commentCount: 0,
});

describe('NoteGrid / NoteList', () => {
  it('uses the auto-fill 300px grid with a 16px gap', () => {
    const { container } = render(
      <NoteGrid notes={[make('a', 'A')]} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(min(100%, 300px), 1fr))');
    expect(grid.className).toContain('gap-16');
  });

  it('renders one card per note', () => {
    render(<NoteGrid notes={[make('a', 'A'), make('b', 'B')]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getAllByRole('button', { name: /^[AB]$/ })).toHaveLength(2);
  });

  it('turns every card into a link when hrefFor is given', () => {
    const { container } = render(
      <NoteGrid notes={[make('a', 'A')]} hrefFor={(n) => `/notes/${n.id}`} onToggleFavorite={() => {}} />,
    );
    expect(container.querySelector('a')).toHaveAttribute('href', '/notes/a');
  });

  it('renders an empty container without crashing for zero notes', () => {
    const { container } = render(<NoteGrid notes={[]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(container.firstElementChild?.children).toHaveLength(0);
  });

  it('NoteList wraps rows in a single bordered, clipped panel', () => {
    const { container } = render(
      <NoteList notes={[make('a', 'A')]} onOpen={() => {}} onToggleFavorite={() => {}} />,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('rounded-14');
    expect(panel.className).toContain('overflow-hidden');
    expect(panel.className).toContain('border-line');
    expect(panel.className).toContain('bg-surface');
  });

  it('a 120-character title still truncates in the list row', () => {
    render(<NoteList notes={[make('a', 'x'.repeat(120))]} onOpen={() => {}} onToggleFavorite={() => {}} />);
    expect(screen.getByText('x'.repeat(120)).className).toContain('truncate');
  });
});
