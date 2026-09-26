// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shuffle } from './array';

afterEach(() => vi.restoreAllMocks());

describe('shuffle', () => {
  it('does not mutate the input', () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    shuffle(src);
    expect(src).toEqual(copy);
  });

  it('preserves every element', () => {
    const out = shuffle(['a', 'b', 'c', 'd']);
    expect([...out].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is a Fisher-Yates walk from the end (deterministic with Math.random stubbed to 0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // j is always 0, so each element from the end is swapped with index 0.
    expect(shuffle([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
  });

  it('is identity when Math.random maps j back to i', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(shuffle([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([7])).toEqual([7]);
  });
});
