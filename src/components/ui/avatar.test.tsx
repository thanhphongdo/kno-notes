import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, initialsOf } from './avatar';

describe('Avatar', () => {
  it('takes the first two letters, uppercased', () => {
    expect(initialsOf('Bác sĩ')).toBe('BÁ');
    expect(initialsOf('an')).toBe('AN');
  });

  it('falls back to ? for an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
  });

  it('renders 32px in the sidebar and 30px in comments', () => {
    const { container, rerender } = render(<Avatar name="Bác sĩ" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-32');
    rerender(<Avatar name="Bác sĩ" size={30} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('h-30');
  });

  it('is decorative, not announced', () => {
    const { container } = render(<Avatar name="Bác sĩ" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
