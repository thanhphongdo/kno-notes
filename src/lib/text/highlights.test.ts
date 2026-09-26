import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_INDEX_CHARS,
  HIGHLIGHT_INDEX_MAX,
  collectHighlights,
  highlightTexts,
} from './highlights';

describe('collectHighlights', () => {
  it('joins the fragments of one highlight, in document order, collapsing whitespace', () => {
    const html =
      '<p>x <mark data-hl="h1">hai</mark></p><p><mark data-hl="h1">  Ba </mark></p><p><mark data-hl="h2">z</mark></p>';
    expect(collectHighlights(html)).toEqual([
      { id: 'h1', text: 'hai Ba' },
      { id: 'h2', text: 'z' },
    ]);
  });

  it('groups marks by data-hl and joins their text with a single space', () => {
    const html = '<p><mark data-hl="h1">Ưu tiên</mark> viên <mark data-hl="h1">phối hợp</mark></p>';
    expect(collectHighlights(html)).toEqual([{ id: 'h1', text: 'Ưu tiên phối hợp' }]);
  });

  it('returns an empty array for content without highlights', () => {
    expect(collectHighlights('<p>plain</p>')).toEqual([]);
    expect(collectHighlights('')).toEqual([]);
    expect(collectHighlights(null)).toEqual([]);
    expect(collectHighlights(undefined)).toEqual([]);
  });

  it('decodes entities and strips inline tags the way textContent would', () => {
    expect(collectHighlights('<mark data-hl="h1">a &amp; b</mark>')).toEqual([
      { id: 'h1', text: 'a & b' },
    ]);
    expect(collectHighlights('<mark data-hl="h1">liều <strong>0,5</strong> mg</mark>')).toEqual([
      { id: 'h1', text: 'liều 0,5 mg' },
    ]);
    expect(collectHighlights('<mark data-hl="h1">&#60;ECG&#62; &#x2014; ok</mark>')).toEqual([
      { id: 'h1', text: '<ECG> — ok' },
    ]);
  });

  it('keeps first-seen order across interleaved ids', () => {
    const html =
      '<mark data-hl="b">B1</mark><mark data-hl="a">A1</mark><mark data-hl="b">B2</mark>';
    expect(collectHighlights(html)).toEqual([
      { id: 'b', text: 'B1 B2' },
      { id: 'a', text: 'A1' },
    ]);
  });

  it('produces the same result when DOMParser is missing (SSR)', () => {
    const html = '<p>a <mark data-hl="h1">one</mark> b <mark data-hl="h1">two</mark></p>';
    const saved = globalThis.DOMParser;
    // @ts-expect-error - simulating the Node server runtime, which has no DOMParser
    delete globalThis.DOMParser;
    try {
      expect(collectHighlights(html)).toEqual([{ id: 'h1', text: 'one two' }]);
    } finally {
      globalThis.DOMParser = saved;
    }
  });
});

describe('highlightTexts', () => {
  it('returns just the texts, in order', () => {
    const html = '<mark data-hl="a">một</mark><mark data-hl="b">hai</mark>';
    expect(highlightTexts(html)).toEqual(['một', 'hai']);
  });

  it('drops highlights whose text is empty', () => {
    const html = '<mark data-hl="a">  </mark><mark data-hl="b">hai</mark>';
    expect(highlightTexts(html)).toEqual(['hai']);
  });

  it('caps how many highlights one note contributes to the index', () => {
    const html = Array.from(
      { length: HIGHLIGHT_INDEX_MAX + 10 },
      (_, i) => `<mark data-hl="h${i}">đoạn ${i}</mark>`,
    ).join('');
    expect(highlightTexts(html)).toHaveLength(HIGHLIGHT_INDEX_MAX);
  });

  it('truncates a very long highlight instead of shipping the whole paragraph', () => {
    const long = 'a'.repeat(HIGHLIGHT_INDEX_CHARS + 50);
    expect(highlightTexts(`<mark data-hl="h1">${long}</mark>`)).toEqual([
      'a'.repeat(HIGHLIGHT_INDEX_CHARS),
    ]);
  });

  it('is empty for content without highlights', () => {
    expect(highlightTexts('<p>x</p>')).toEqual([]);
  });
});
