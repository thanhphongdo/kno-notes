import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchSuggestions } from './search-suggestions';

const BASE: ComponentProps<typeof SearchSuggestions> = {
  query: '',
  recent: ['sốc phản vệ', 'ECG'],
  onRecentSelect: vi.fn(),
  onClearRecent: vi.fn(),
  tags: [{ name: 'Cấp cứu', count: 4 }],
  tagsTitle: 'Thẻ',
  onTagSelect: vi.fn(),
  notes: [{ id: 'n1', title: 'Đọc ECG trong 10 bước', sub: '#Tim mạch · 3 ngày trước', priority: 'medium' }],
  notesTitle: 'Mở gần đây',
  onNoteSelect: vi.fn(),
  onSubmit: vi.fn(),
};

describe('SearchSuggestions', () => {
  it('emits the data-search-suggestions hook on its root', () => {
    const { container } = render(<SearchSuggestions {...BASE} />);
    expect(container.firstElementChild).toHaveAttribute('data-search-suggestions');
  });

  it('shows recent searches, tags and notes with the idle headings', () => {
    render(<SearchSuggestions {...BASE} />);
    expect(screen.getByText('Tìm gần đây')).toBeInTheDocument();
    expect(screen.getByText('Thẻ')).toBeInTheDocument();
    expect(screen.getByText('Mở gần đây')).toBeInTheDocument();
  });

  it('hides recent searches once the user types', () => {
    render(<SearchSuggestions {...BASE} query="ecg" tagsTitle="Thẻ khớp" notesTitle="Ghi chú khớp" />);
    expect(screen.queryByText('Tìm gần đây')).toBeNull();
    expect(screen.getByText('Thẻ khớp')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú khớp')).toBeInTheDocument();
  });

  it('selects a recent term', async () => {
    const onRecentSelect = vi.fn();
    render(<SearchSuggestions {...BASE} onRecentSelect={onRecentSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'sốc phản vệ' }));
    expect(onRecentSelect).toHaveBeenCalledWith('sốc phản vệ');
  });

  it('clears recent searches', async () => {
    const onClearRecent = vi.fn();
    render(<SearchSuggestions {...BASE} onClearRecent={onClearRecent} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(onClearRecent).toHaveBeenCalledTimes(1);
  });

  it('selects a tag and a note', async () => {
    const onTagSelect = vi.fn();
    const onNoteSelect = vi.fn();
    render(<SearchSuggestions {...BASE} onTagSelect={onTagSelect} onNoteSelect={onNoteSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /#Cấp cứu/ }));
    expect(onTagSelect).toHaveBeenCalledWith('Cấp cứu');
    await userEvent.click(screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }));
    expect(onNoteSelect).toHaveBeenCalledWith('n1');
  });

  it('shows the "no suggestions" line when a query matches nothing', () => {
    render(<SearchSuggestions {...BASE} query="zzz" tags={[]} notes={[]} recent={[]} />);
    expect(screen.getByText('Không có gợi ý cho “zzz”')).toBeInTheDocument();
  });

  it('offers the full-results row with an Enter hint whenever there is a query', async () => {
    const onSubmit = vi.fn();
    render(<SearchSuggestions {...BASE} query="ecg" onSubmit={onSubmit} />);
    const row = screen.getByRole('button', { name: /Xem tất cả kết quả cho “ecg”/ });
    expect(row).toHaveTextContent('Enter');
    await userEvent.click(row);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('omits the full-results row when the query is empty', () => {
    render(<SearchSuggestions {...BASE} />);
    expect(screen.queryByText(/Xem tất cả kết quả/)).toBeNull();
  });

  it('keeps the prototype metrics by default and reports its density', () => {
    const { container } = render(<SearchSuggestions {...BASE} query="ecg" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-density', 'compact');
    expect(screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }).className).toContain('py-9');
    expect(screen.getByRole('button', { name: /Xem tất cả kết quả cho/ }).className).toContain('h-38');
  });

  it('grows every row to a 44px+ touch target at comfortable density', () => {
    const { container } = render(<SearchSuggestions {...BASE} density="comfortable" />);
    expect(container.firstElementChild).toHaveAttribute('data-density', 'comfortable');
    expect(screen.getByRole('button', { name: 'sốc phản vệ' }).className).toContain('h-48');
    expect(screen.getByRole('button', { name: 'Xoá' }).className).toContain('h-44');
    expect(screen.getByRole('button', { name: /#Cấp cứu/ }).className).toContain('h-36');
    expect(screen.getByRole('button', { name: /Đọc ECG trong 10 bước/ }).className).toContain('py-12');
  });

  it('shows the same sections in the same order at either density', () => {
    const order = (density: 'compact' | 'comfortable') => {
      const { container, unmount } = render(<SearchSuggestions {...BASE} density={density} />);
      const text = (container.textContent ?? '');
      unmount();
      return ['Tìm gần đây', 'Thẻ', 'Mở gần đây'].map((label) => text.indexOf(label));
    };
    const compact = order('compact');
    expect(compact).toEqual([...compact].sort((a, b) => a - b));
    expect(order('comfortable')).toEqual(compact);
  });

  it('keeps the comfortable full-results row at 52px', () => {
    render(<SearchSuggestions {...BASE} query="ecg" density="comfortable" />);
    expect(screen.getByRole('button', { name: /Xem tất cả kết quả cho/ }).className).toContain('h-52');
  });
});

describe('SearchSuggestions — marked passages', () => {
  const withHighlight = {
    ...BASE,
    query: 'kẻ ngang',
    notesTitle: 'Ghi chú khớp',
    notes: [
      {
        id: 'n9',
        title: 'Chuỗi xung cơ bản trên MRI',
        sub: '#Chẩn đoán hình ảnh · hôm qua',
        priority: 'high' as const,
        highlight: 'toàn bộ chiều sâu là các đường kẻ ngang song song',
      },
    ],
  };

  it('shows the marked passage that made the note match', () => {
    render(<SearchSuggestions {...withHighlight} />);
    expect(
      screen.getByText('toàn bộ chiều sâu là các đường kẻ ngang song song'),
    ).toBeInTheDocument();
  });

  it('renders it as a highlight, so it reads like the rail', () => {
    const { container } = render(<SearchSuggestions {...withHighlight} />);
    const snippet = container.querySelector('[data-highlight-snippet]');
    expect(snippet).not.toBeNull();
    expect(snippet).toHaveClass('bg-hl');
  });

  it('omits the line entirely when nothing was marked', () => {
    const { container } = render(<SearchSuggestions {...BASE} />);
    expect(container.querySelector('[data-highlight-snippet]')).toBeNull();
  });
});
