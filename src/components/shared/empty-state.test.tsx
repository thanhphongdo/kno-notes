import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the dashed frame with the serif title and the data-empty-state hook', () => {
    const { container } = render(<EmptyState title="Không tìm thấy ghi chú" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('data-empty-state');
    expect(el.className).toContain('border-dashed');
    expect(el.className).toContain('border-line2');
    expect(el.className).toContain('rounded-14');
    expect(el.className).toContain('py-80');
    expect(screen.getByText('Không tìm thấy ghi chú').className).toContain('font-serif');
  });

  it('omits the action when no handler is supplied', () => {
    render(<EmptyState title="Không tìm thấy ghi chú" actionLabel="Xoá bộ lọc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires the action', async () => {
    const onAction = vi.fn();
    render(<EmptyState title="Không tìm thấy ghi chú" actionLabel="Xoá bộ lọc" onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
