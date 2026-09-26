// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sections, stripHtml, extractHighlights } from './html';

describe('sections', () => {
  it('returns [] for empty, null and undefined input', () => {
    expect(sections('')).toEqual([]);
    expect(sections(null)).toEqual([]);
    expect(sections(undefined)).toEqual([]);
  });

  it('opens a section on H2 and collects list items', () => {
    const html =
      '<h2>Ngưỡng chẩn đoán</h2><ul><li>HA tại nhà ≥ 135/85</li><li>Holter ≥ 130/80</li></ul>';
    expect(sections(html)).toEqual([
      { h: 'Ngưỡng chẩn đoán', items: ['HA tại nhà ≥ 135/85', 'Holter ≥ 130/80'] },
    ]);
  });

  it('opens a section on H3 too', () => {
    expect(sections('<h3>Phụ</h3><p>nội dung</p>')).toEqual([{ h: 'Phụ', items: ['nội dung'] }]);
  });

  it('collects ordered list items', () => {
    expect(sections('<h2>A</h2><ol><li>một</li><li>hai</li></ol>')).toEqual([
      { h: 'A', items: ['một', 'hai'] },
    ]);
  });

  it('collects paragraphs and blockquotes but skips empty ones', () => {
    const html = '<h2>A</h2><p>đoạn</p><p>   </p><blockquote>trích</blockquote>';
    expect(sections(html)).toEqual([{ h: 'A', items: ['đoạn', 'trích'] }]);
  });

  it('skips the header row of a table and joins cells with an em dash', () => {
    const html =
      '<h2>Bảng điểm</h2><table><tr><th>Thành phần</th><th>Điểm</th></tr>' +
      '<tr><td>Mắt (E)</td><td>1–4</td></tr><tr><td>Lời nói (V)</td><td>1–5</td></tr></table>';
    expect(sections(html)).toEqual([
      { h: 'Bảng điểm', items: ['Mắt (E) — 1–4', 'Lời nói (V) — 1–5'] },
    ]);
  });

  it('drops content that appears before the first heading', () => {
    expect(sections('<p>mồ côi</p><h2>A</h2><p>con</p>')).toEqual([{ h: 'A', items: ['con'] }]);
  });

  it('drops headings that collect no items', () => {
    expect(sections('<h2>Rỗng</h2><h2>Có</h2><p>x</p>')).toEqual([{ h: 'Có', items: ['x'] }]);
  });

  it('trims the heading text', () => {
    expect(sections('<h2>  Mục tiêu  </h2><p>x</p>')[0].h).toBe('Mục tiêu');
  });

  it('reads through inline markup inside list items', () => {
    expect(
      sections('<h2>A</h2><ul><li>HA <strong>≥ 140/90</strong> mmHg</li></ul>')[0].items[0],
    ).toBe('HA ≥ 140/90 mmHg');
  });

  it('handles a multi-section prototype note', () => {
    const html =
      '<h2>Ngưỡng chẩn đoán</h2><p>Tăng huyết áp khi HA ≥ 140/90 mmHg.</p>' +
      '<h2>Mục tiêu điều trị</h2><p>Mục tiêu &lt; 130/80 mmHg.</p>' +
      '<h2>Lựa chọn thuốc khởi đầu</h2><ol><li>Phối hợp hai thuốc.</li></ol>';
    const out = sections(html);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.h)).toEqual([
      'Ngưỡng chẩn đoán',
      'Mục tiêu điều trị',
      'Lựa chọn thuốc khởi đầu',
    ]);
    expect(out[1].items).toEqual(['Mục tiêu < 130/80 mmHg.']);
  });
});

describe('stripHtml', () => {
  it('replaces tags with spaces and collapses whitespace', () => {
    expect(stripHtml('<h2>A</h2><p>b  c</p>')).toBe('A b c');
  });

  it('returns an empty string for nullish input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('extractHighlights', () => {
  it('groups marks by data-hl and joins their text with a single space', () => {
    const html = '<p><mark data-hl="h1">Ưu tiên</mark> viên <mark data-hl="h1">phối hợp</mark></p>';
    expect(extractHighlights(html)).toEqual([{ id: 'h1', text: 'Ưu tiên phối hợp' }]);
  });

  it('preserves document order across distinct highlights', () => {
    const html = '<p><mark data-hl="a">một</mark><mark data-hl="b">hai</mark></p>';
    expect(extractHighlights(html).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('returns [] when there are no marks', () => {
    expect(extractHighlights('<p>x</p>')).toEqual([]);
  });
});
