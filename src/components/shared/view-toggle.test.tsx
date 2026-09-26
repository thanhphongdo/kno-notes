import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewToggle } from './view-toggle';

describe('ViewToggle', () => {
  it('marks the current mode', () => {
    render(<ViewToggle value="list" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Dạng danh sách' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dạng lưới' })).toHaveAttribute('aria-checked', 'false');
  });

  it('emits the other mode on click', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="grid" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dạng danh sách' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
