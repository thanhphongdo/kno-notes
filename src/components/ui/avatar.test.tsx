import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, initialsOf } from './avatar';

describe('Avatar', () => {
  it('uppercases the initials it derives', () => {
    expect(initialsOf('Bác sĩ')).toBe('BS');
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

describe('initialsOf uses word initials, matching the prototype', () => {
  it('renders BS for "Bác sĩ", as the prototype hard-coded', () => {
    expect(initialsOf('Bác sĩ')).toBe('BS');
  });
  it('uses the first and last word for a full Vietnamese name', () => {
    expect(initialsOf('Nguyễn Văn An')).toBe('NA');
    expect(initialsOf('  Trần   Thu  ')).toBe('TT');
  });
  it('falls back to two characters for a single word', () => {
    expect(initialsOf('bacsi')).toBe('BA');
    expect(initialsOf('K')).toBe('K');
  });
  it('still returns ? for an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
