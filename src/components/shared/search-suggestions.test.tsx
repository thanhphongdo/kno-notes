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
});
