import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from './segmented';

const OPTS = [
  { value: 'light', label: 'Sáng', icon: 'sun' as const },
  { value: 'dark', label: 'Tối', icon: 'moon' as const },
];

describe('Segmented', () => {
  it('renders a radiogroup with one checked radio', () => {
    render(<Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />);
    expect(screen.getByRole('radiogroup', { name: 'Giao diện' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sáng' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'false');
  });

  it('emits the value on click', async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTS} value="light" onChange={onChange} ariaLabel="Giao diện" columns={2} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('track variant: p-4 gap-4 bg-surface2 rounded-10, items h-34 rounded-7', () => {
    const { container } = render(
      <Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />,
    );
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).toContain('bg-surface2');
    expect(track.className).toContain('rounded-10');
    expect(track.className).toContain('p-4');
    expect(track.className).toContain('gap-4');
    expect(screen.getByRole('radio', { name: 'Sáng' }).className).toContain('h-34');
    expect(screen.getByRole('radio', { name: 'Sáng' }).className).toContain('rounded-7');
  });

  it('gives the selected item the surface lift shadow', () => {
    render(<Segmented options={OPTS} value="light" onChange={() => {}} ariaLabel="Giao diện" columns={2} />);
    const on = screen.getByRole('radio', { name: 'Sáng' });
    expect(on.className).toContain('bg-surface');
    expect(on.className).toContain('shadow-seg');
    expect(screen.getByRole('radio', { name: 'Tối' }).className).toContain('bg-transparent');
  });

  it('bordered variant: 30x28 items with rounded-6 inside a 1px frame', () => {
    const { container } = render(
      <Segmented
        variant="bordered"
        options={[
          { value: 'grid', icon: 'grid', title: 'Dạng lưới' },
          { value: 'list', icon: 'list', title: 'Dạng danh sách' },
        ]}
        value="grid"
        onChange={() => {}}
        ariaLabel="Hiển thị"
      />,
    );
    const track = container.firstElementChild as HTMLElement;
    expect(track.className).toContain('border-line');
    expect(track.className).toContain('rounded-9');
    expect(track.className).toContain('p-3');
    const item = screen.getByRole('radio', { name: 'Dạng lưới' });
    expect(item.className).toContain('h-28');
    expect(item.className).toContain('w-30');
    expect(item.className).toContain('rounded-6');
  });
});
