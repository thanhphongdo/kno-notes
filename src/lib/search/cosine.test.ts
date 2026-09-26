import { describe, it, expect } from 'vitest';
import { cosineSimilarity, l2Normalize } from './cosine';

const unit = (...v: number[]): Float32Array => {
  const len = Math.hypot(...v) || 1;
  return new Float32Array(v.map((x) => x / len));
};

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity(unit(1, 0, 0), unit(1, 0, 0))).toBeCloseTo(1, 6);
    expect(cosineSimilarity(unit(1, 0, 0), unit(0, 1, 0))).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity(unit(1, 0, 0), unit(-1, 0, 0))).toBeCloseTo(-1, 6);
  });

  it('is 0 rather than NaN when a vector is all zeros', () => {
    expect(cosineSimilarity(new Float32Array([0, 0, 0]), unit(1, 0, 0))).toBe(0);
  });

  it('is 0 when the lengths differ or a vector is empty', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBe(0);
    expect(cosineSimilarity(new Float32Array(0), new Float32Array(0))).toBe(0);
  });

  it('ignores magnitude', () => {
    const a = new Float32Array([3, 4, 0]);
    const b = new Float32Array([30, 40, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });
});

describe('l2Normalize', () => {
  it('produces a unit vector', () => {
    const out = l2Normalize(new Float32Array([3, 4]));
    expect(Math.hypot(out[0]!, out[1]!)).toBeCloseTo(1, 6);
    expect(out[0]!).toBeCloseTo(0.6, 6);
  });

  it('leaves an all-zero vector alone instead of producing NaN', () => {
    const out = l2Normalize(new Float32Array([0, 0, 0]));
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});
