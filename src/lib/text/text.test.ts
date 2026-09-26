// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { norm, clip, slugify } from './normalize';

describe('norm', () => {
  it('lowercases', () => {
    expect(norm('ABC')).toBe('abc');
  });

  it('strips Vietnamese diacritics via NFD', () => {
    expect(norm('Tim mạch')).toBe('tim mach');
    expect(norm('Phác đồ')).toBe('phac do');
    expect(norm('Cấp cứu')).toBe('cap cuu');
    expect(norm('Nội tiết')).toBe('noi tiet');
    expect(norm('Chẩn đoán hình ảnh')).toBe('chan doan hinh anh');
  });

  it('maps đ to d (đ has no NFD decomposition)', () => {
    expect(norm('đ')).toBe('d');
    expect(norm('Đái tháo đường')).toBe('dai thao duong');
    expect(norm('Điện giải')).toBe('dien giai');
  });

  it('normalises "Sổ" to "so"', () => {
    expect(norm('Sổ')).toBe('so');
    expect(norm('Sổ Lâm Sàng')).toBe('so lam sang');
  });

  it('handles every Vietnamese vowel family', () => {
    expect(norm('ăâêôơư')).toBe('aaeoou');
    expect(norm('ằẳẵặầẩẫậềểễệồổỗộờởỡợừửữự')).toBe('aaaaaaaaeeeeoooooooouuuu');
    expect(norm('ýỳỷỹỵ')).toBe('yyyyy');
  });

  it('returns an empty string for null and undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm('')).toBe('');
  });

  it('leaves punctuation and digits alone', () => {
    expect(norm('HA ≥ 140/90 mmHg')).toBe('ha ≥ 140/90 mmhg');
  });
});

describe('clip', () => {
  it('returns the string unchanged when at or under the limit', () => {
    expect(clip('abc', 3)).toBe('abc');
    expect(clip('abc')).toBe('abc');
  });

  it('cuts to n-1 characters, trims, and appends an ellipsis', () => {
    expect(clip('abcdef', 4)).toBe('abc…');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    expect(clip('abc def', 5)).toBe('abc…');
  });

  it('defaults to 150 characters', () => {
    const long = 'x'.repeat(200);
    expect(clip(long)).toHaveLength(150);
    expect(clip(long).endsWith('…')).toBe(true);
  });
});

describe('slugify', () => {
  it('normalises Vietnamese then hyphenates', () => {
    expect(slugify('Tim mạch')).toBe('tim-mach');
    expect(slugify('Chẩn đoán hình ảnh')).toBe('chan-doan-hinh-anh');
    expect(slugify('Đái tháo đường')).toBe('dai-thao-duong');
  });

  it('collapses runs of separators and trims them from both ends', () => {
    expect(slugify('  --Phác  đồ--  ')).toBe('phac-do');
  });

  it('is stable across accent variants of the same tag', () => {
    expect(slugify('Tim mạch')).toBe(slugify('tim mach'));
  });

  it('falls back to "tag" when nothing survives', () => {
    expect(slugify('###')).toBe('tag');
    expect(slugify('')).toBe('tag');
  });
});
