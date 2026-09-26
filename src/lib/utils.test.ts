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

describe('cn keeps line-height alongside our pixel font sizes', () => {
  it('does not let a later text-<n> evict an earlier leading-[…]', () => {
    // Regression: the quiz question rendered at line-height 1.5 instead of the
    // 1.35 the design spec requires, because tailwind-merge treats `font-size`
    // as conflicting with `leading` (Tailwind's `text-lg/7` shorthand sets
    // both). We never use that shorthand, so the rule is pure downside.
    const out = cn('font-serif leading-[1.35] tracking-[-.01em]', 'text-28');
    expect(out).toContain('leading-[1.35]');
    expect(out).toContain('text-28');
  });

  it('still lets an explicit leading win over an earlier leading', () => {
    expect(cn('leading-[1.35]', 'leading-[1.72]')).toBe('leading-[1.72]');
  });

  it('still de-duplicates the scales it was taught', () => {
    expect(cn('rounded-9', 'rounded-8')).toBe('rounded-8');
    expect(cn('text-muted', 'text-13')).toBe('text-muted text-13');
    expect(cn('text-17', 'text-28')).toBe('text-28');
  });
});
