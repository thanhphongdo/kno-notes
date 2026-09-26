import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later Tailwind utility win over an earlier conflicting one', () => {
    expect(cn('h-36', 'h-40')).toBe('h-40');
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('h-36 rounded-9', 'px-12')).toBe('h-36 rounded-9 px-12');
  });

  it('resolves the 1px radius scale instead of emitting both radii', () => {
    expect(cn('rounded-9', 'rounded-8')).toBe('rounded-8');
    expect(cn('rounded-full', 'rounded-circle')).toBe('rounded-circle');
    expect(cn('rounded-t-14', 'rounded-t-10')).toBe('rounded-t-10');
    expect(cn('rounded-10', 'rounded-full')).toBe('rounded-full');
  });

  it('treats numeric text utilities as font sizes, never as colours', () => {
    expect(cn('text-muted', 'text-13')).toBe('text-muted text-13');
    expect(cn('text-13', 'text-muted')).toBe('text-13 text-muted');
    expect(cn('text-13', 'text-15')).toBe('text-15');
    expect(cn('text-fs', 'text-17')).toBe('text-17');
  });

  it('still resolves real colour conflicts', () => {
    expect(cn('text-muted', 'text-faint')).toBe('text-faint');
    expect(cn('border-line', 'border-accent')).toBe('border-accent');
  });
});
