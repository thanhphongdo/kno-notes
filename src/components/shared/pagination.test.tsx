import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('renders the Vietnamese range sentence', () => {
    render(<Pagination page={1} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 1–6 trên 14')).toBeInTheDocument();
  });

  it('clamps the upper bound on the last, partial page', () => {
    render(<Pagination page={3} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 13–14 trên 14')).toBeInTheDocument();
  });

  it('renders nothing at all when there are no results', () => {
    const { container } = render(<Pagination page={1} pageCount={1} total={0} pageSize={6} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the range but no page buttons when there is a single page', () => {
    render(<Pagination page={1} pageCount={1} total={4} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByText('Hiển thị 1–4 trên 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trang 1' })).toBeNull();
  });

  it('marks the current page and emits others', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} total={14} pageSize={6} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Trang 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables prev on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).not.toBeDisabled();
    rerender(<Pagination page={3} pageCount={3} total={14} pageSize={6} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('renders page numbers in mono, current on --text / --bg', () => {
    render(<Pagination page={1} pageCount={2} total={12} pageSize={6} onPageChange={() => {}} />);
    const current = screen.getByRole('button', { name: 'Trang 1' });
    expect(current.className).toContain('font-mono');
    expect(current.className).toContain('bg-text');
    expect(current.className).toContain('text-bg');
    expect(current.className).toContain('min-w-36');
    expect(current.className).toContain('h-36');
  });
});
