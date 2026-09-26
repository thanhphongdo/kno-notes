import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectOption } from './select';

type K = 'updated' | 'priority' | 'title';
const OPTIONS: readonly SelectOption<K>[] = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'priority', label: 'Ưu tiên' },
  { value: 'title', label: 'Tên A–Z' },
];

function setup(value: K = 'updated') {
  const onChange = vi.fn();
  render(<Select options={OPTIONS} value={value} onChange={onChange} ariaLabel="Sắp xếp" prefixLabel="Sắp xếp" />);
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Sắp xếp' }) };
}

describe('Select', () => {
  it('is never a native <select>', () => {
    const { container } = render(
      <Select options={OPTIONS} value="updated" onChange={() => {}} ariaLabel="Sắp xếp" />,
    );
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows the current label and marks itself collapsed', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Mới cập nhật');
  });

  it('opens a listbox and marks the selected option', async () => {
    const { trigger } = setup('priority');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Sắp xếp' });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ưu tiên' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Tên A–Z' })).toHaveAttribute('aria-selected', 'false');
  });

  it('commits a click and closes', async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: 'Tên A–Z' }));
    expect(onChange).toHaveBeenCalledWith('title');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves the active option with ArrowDown/ArrowUp and commits with Enter', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('priority');
  });

  it('jumps to first/last with Home and End', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{End}');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('commits with Space as well as Enter', async () => {
    const { onChange, trigger } = setup('updated');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('title');
  });

  it('closes on Escape and returns focus to the trigger without committing', async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('select-backdrop'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', async () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="updated" onChange={onChange} ariaLabel="Sắp xếp" disabled />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Sắp xếp' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
