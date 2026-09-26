import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterChips } from './filter-chips';

describe('FilterChips', () => {
  it('renders nothing when there are no chips', () => {
    const { container } = render(<FilterChips chips={[]} onClearAll={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip per filter and a clear-all link', () => {
    render(
      <FilterChips
        chips={[
          { id: 'q', label: '“sốc”', onRemove: () => {} },
          { id: 'tag', label: '#Cấp cứu', onRemove: () => {} },
        ]}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gỡ bộ lọc “sốc”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gỡ bộ lọc #Cấp cứu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('emits removal and clear-all', async () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    render(<FilterChips chips={[{ id: 'q', label: '“sốc”', onRemove }]} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ bộ lọc “sốc”' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
