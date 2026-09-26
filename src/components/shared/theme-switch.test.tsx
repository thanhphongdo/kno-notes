import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSwitch } from './theme-switch';

describe('ThemeSwitch', () => {
  it('offers Sáng and Tối as a 2-column track', () => {
    const { container } = render(<ThemeSwitch value="light" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Sáng' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns)
      .toBe('repeat(2, minmax(0, 1fr))');
  });

  it('marks the active theme', () => {
    render(<ThemeSwitch value="dark" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true');
  });

  it('emits the other theme', async () => {
    const onChange = vi.fn();
    render(<ThemeSwitch value="light" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
