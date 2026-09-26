import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SORT_OPTIONS, SortSelect } from './sort-select';

describe('SortSelect', () => {
  it('offers exactly the three prototype sorts, in order', () => {
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual(['Mới cập nhật', 'Ưu tiên', 'Tên A–Z']);
  });

  it('shows the "Sắp xếp" prefix and the active label', () => {
    render(<SortSelect value="priority" onChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Sắp xếp' });
    expect(trigger).toHaveTextContent('Sắp xếp');
    expect(trigger).toHaveTextContent('Ưu tiên');
  });

  it('emits the chosen key', async () => {
    const onChange = vi.fn();
    render(<SortSelect value="updated" onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Sắp xếp' }));
    await userEvent.click(screen.getByRole('option', { name: 'Tên A–Z' }));
    expect(onChange).toHaveBeenCalledWith('title');
  });
});
