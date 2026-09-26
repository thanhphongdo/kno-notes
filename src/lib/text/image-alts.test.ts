import { describe, expect, it } from 'vitest';
import {
  IMAGE_ALT_INDEX_CHARS,
  IMAGE_ALT_INDEX_MAX,
  imageAltTexts,
  inlineImageAlts,
} from './image-alts';

describe('inlineImageAlts', () => {
  it('reads the alt of every image in the body, in order', () => {
    const html = '<p><img src="/a" alt="Sơ đồ bậc điều trị"></p><img src="/b" alt="Bảng liều">';
    expect(inlineImageAlts(html)).toEqual(['Sơ đồ bậc điều trị', 'Bảng liều']);
  });

  it('accepts single quotes and unquoted values', () => {
    expect(inlineImageAlts(`<img src='/a' alt='ECG'>`)).toEqual(['ECG']);
    expect(inlineImageAlts('<img src=/a alt=ECG>')).toEqual(['ECG']);
  });

  it('is not confused by other attributes whose name ends in alt', () => {
    expect(inlineImageAlts('<img src="/a" data-salt="x" alt="thật">')).toEqual(['thật']);
    expect(inlineImageAlts('<img src="/a" data-alt="giả">')).toEqual([]);
  });

  it('decodes entities and collapses whitespace', () => {
    expect(inlineImageAlts('<img alt="a &amp;  b">')).toEqual(['a & b']);
  });

  it('skips images with no alt, an empty alt, or no images at all', () => {
    expect(inlineImageAlts('<img src="/a"><img src="/b" alt="">')).toEqual([]);
    expect(inlineImageAlts('<p>không có ảnh</p>')).toEqual([]);
    expect(inlineImageAlts('')).toEqual([]);
    expect(inlineImageAlts(null)).toEqual([]);
  });
});

describe('imageAltTexts', () => {
  it('puts attachment labels first, then the alts found in the body', () => {
    expect(imageAltTexts('<img alt="trong bài">', ['đính kèm'])).toEqual([
      'đính kèm',
      'trong bài',
    ]);
  });

  it('does not repeat an alt that appears in both places', () => {
    expect(imageAltTexts('<img alt="Sơ đồ">', ['Sơ đồ'])).toEqual(['Sơ đồ']);
  });

  it('drops labels that are blank', () => {
    expect(imageAltTexts('', ['', '   ', 'thật'])).toEqual(['thật']);
  });

  it('caps the count and the length', () => {
    const many = Array.from({ length: IMAGE_ALT_INDEX_MAX + 5 }, (_, i) => `alt ${i}`);
    expect(imageAltTexts('', many)).toHaveLength(IMAGE_ALT_INDEX_MAX);

    const long = 'a'.repeat(IMAGE_ALT_INDEX_CHARS + 50);
    expect(imageAltTexts('', [long])).toEqual(['a'.repeat(IMAGE_ALT_INDEX_CHARS)]);
  });

  it('is empty for a note with no images', () => {
    expect(imageAltTexts('<p>x</p>')).toEqual([]);
  });
});
