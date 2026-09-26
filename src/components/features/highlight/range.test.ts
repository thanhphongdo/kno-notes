import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectHighlights, newHighlightId, rangeIntersectsNode, unwrapHl, wrapRange,
} from './range';

function mount(html: string): HTMLDivElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById('root') as HTMLDivElement;
}

function selectAcross(
  root: HTMLElement, startSel: string, startOffset: number, endSel: string, endOffset: number,
): Range {
  const start = root.querySelector(startSel)!.firstChild!;
  const end = root.querySelector(endSel)!.firstChild!;
  const r = document.createRange();
  r.setStart(start, startOffset);
  r.setEnd(end, endOffset);
  return r;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('wrapRange', () => {
  it('wraps a partial selection inside one text node', () => {
    const root = mount('<p>Adrenalin 0,5 mg tiêm bắp</p>');
    const t = root.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 9);
    wrapRange(r, 'h1');
    expect(root.innerHTML).toBe('<p><mark data-hl="h1">Adrenalin</mark> 0,5 mg tiêm bắp</p>');
  });

  it('wraps a selection spanning two block elements as two marks with one id', () => {
    const root = mount('<p>Một hai</p><p>Ba bốn</p>');
    const r = selectAcross(root, 'p:nth-of-type(1)', 4, 'p:nth-of-type(2)', 2);
    wrapRange(r, 'h2');
    const marks = root.querySelectorAll('mark[data-hl="h2"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.textContent).toBe('hai');
    expect(marks[1]!.textContent).toBe('Ba');
    expect(root.textContent).toBe('Một haiBa bốn');
  });

  it('never nests a mark inside an existing mark', () => {
    const root = mount('<p>abc <mark data-hl="old">def</mark> ghi</p>');
    const p = root.querySelector('p')!;
    const r = document.createRange();
    r.setStart(p.firstChild!, 1);
    r.setEnd(p.lastChild!, 3);
    wrapRange(r, 'new');
    expect(root.querySelectorAll('mark mark')).toHaveLength(0);
    expect(root.querySelector('mark[data-hl="old"]')!.textContent).toBe('def');
    expect(root.textContent).toBe('abc def ghi');
  });

  it('leaves the document text unchanged across mixed block types', () => {
    const root = mount('<p>Một hai ba</p><ul><li>bốn</li><li>năm</li></ul>');
    const before = root.textContent;
    const r = selectAcross(root, 'p', 4, 'li:nth-of-type(2)', 3);
    wrapRange(r, 'h3');
    expect(root.textContent).toBe(before);
    expect(root.querySelectorAll('mark[data-hl="h3"]').length).toBeGreaterThan(1);
  });

  it('ignores a collapsed range', () => {
    const root = mount('<p>abc</p>');
    const t = root.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 1);
    r.setEnd(t, 1);
    wrapRange(r, 'h4');
    expect(root.querySelectorAll('mark')).toHaveLength(0);
  });
});

describe('unwrapHl', () => {
  it('removes every mark with the id and merges the text back', () => {
    const root = mount('<p>Một <mark data-hl="h2">hai</mark></p><p><mark data-hl="h2">Ba</mark> bốn</p>');
    unwrapHl(root, 'h2');
    expect(root.querySelectorAll('mark')).toHaveLength(0);
    expect(root.innerHTML).toBe('<p>Một hai</p><p>Ba bốn</p>');
  });

  it('leaves other highlights alone', () => {
    const root = mount('<p><mark data-hl="a">x</mark><mark data-hl="b">y</mark></p>');
    unwrapHl(root, 'a');
    expect(root.querySelectorAll('mark')).toHaveLength(1);
    expect((root.querySelector('mark') as HTMLElement).dataset.hl).toBe('b');
  });
});

describe('collectHighlights', () => {
  it('joins the fragments of one highlight, in document order, collapsing whitespace', () => {
    const html =
      '<p>x <mark data-hl="h1">hai</mark></p><p><mark data-hl="h1">  Ba </mark></p><p><mark data-hl="h2">z</mark></p>';
    expect(collectHighlights(html)).toEqual([
      { id: 'h1', text: 'hai Ba' },
      { id: 'h2', text: 'z' },
    ]);
  });

  it('returns an empty array for content without highlights', () => {
    expect(collectHighlights('<p>plain</p>')).toEqual([]);
    expect(collectHighlights('')).toEqual([]);
  });
});

describe('rangeIntersectsNode', () => {
  it('is true for a node inside the range and false for one outside', () => {
    const root = mount('<p id="a">one</p><p id="b">two</p>');
    const r = document.createRange();
    r.selectNodeContents(root.querySelector('#a')!);
    expect(rangeIntersectsNode(r, root.querySelector('#a')!.firstChild!)).toBe(true);
    expect(rangeIntersectsNode(r, root.querySelector('#b')!.firstChild!)).toBe(false);
  });
});

describe('newHighlightId', () => {
  it('is "h" plus the timestamp', () => {
    expect(newHighlightId(1758700000000)).toBe('h1758700000000');
  });
});

describe('collectHighlights runs without a DOM', () => {
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
});
