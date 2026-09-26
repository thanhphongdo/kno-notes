/**
 * Highlight range surgery — a direct port of the prototype's `wrapRange` /
 * `unwrapHl` (So Lam Sang.dc.html lines 777-789) with two deliberate changes:
 *
 * 1. `Range.prototype.intersectsNode` is not reliably present in jsdom, so the
 *    same predicate is expressed with `compareBoundaryPoints`, which is.
 * 2. The range boundaries are read once, before any `splitText`, because
 *    splitting a node moves live range boundaries.
 *
 * Both changes are behaviour-identical for real selections.
 */

export interface CollectedHighlight {
  id: string;
  text: string;
}

/** Prototype: `'h' + Date.now()`. */
export function newHighlightId(now: number = Date.now()): string {
  return `h${now}`;
}

/** jsdom-safe replacement for `Range.intersectsNode`, identical in behaviour. */
export function rangeIntersectsNode(range: Range, node: Node): boolean {
  const owner = node.ownerDocument;
  if (!owner) return false;
  const nodeRange = owner.createRange();
  try {
    nodeRange.selectNodeContents(node);
  } catch {
    return false;
  }
  // intersects ⇔ range.end ≥ node.start AND range.start ≤ node.end
  const startsBeforeNodeEnds = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0;
  const endsAfterNodeStarts = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0;
  return startsBeforeNodeEnds && endsAfterNodeStarts;
}

/**
 * Wrap every text fragment the range covers in its own `<mark data-hl="<id>">`.
 * A selection spanning several block elements becomes several marks sharing one
 * id; text already inside a `<mark>` is skipped so highlights never nest.
 */
export function wrapRange(range: Range, id: string): void {
  if (range.collapsed) return;

  let root: Node | null = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
  if (!root) return;

  const doc = root.ownerDocument ?? document;
  const { startContainer, startOffset, endContainer, endOffset } = range;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (t.length > 0 && rangeIntersectsNode(range, t)) nodes.push(t);
  }

  for (const t of nodes) {
    const start = t === startContainer ? startOffset : 0;
    const end = t === endContainer ? endOffset : t.length;
    if (start >= end) continue;
    if (t.parentElement?.closest('mark')) continue;

    let piece: Text = t;
    if (start > 0) piece = piece.splitText(start);
    if (end - start < piece.length) piece.splitText(end - start);

    const mark = doc.createElement('mark');
    mark.dataset.hl = id;
    piece.parentNode?.insertBefore(mark, piece);
    mark.appendChild(piece);
  }
}

/** Remove every fragment of one highlight and merge the text nodes back. */
export function unwrapHl(root: ParentNode, id: string): void {
  root.querySelectorAll(`mark[data-hl="${id}"]`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as Element).normalize();
  });
}

/**
 * Rail list source: one entry per id, fragments joined with a single space.
 *
 * Deliberately DOM-free. This runs inside `useMemo` in a client component, so
 * it also executes during the server render, where `DOMParser` does not exist.
 * Using `DOMParser` on the client and something else on the server would also
 * risk a hydration mismatch, so both sides share this one implementation.
 *
 * `wrapRange` only ever wraps text nodes, so a `<mark data-hl>` contains text
 * (possibly HTML-escaped) and at most inline formatting from the surrounding
 * prose — stripping tags and decoding entities reproduces `textContent`.
 */
const MARK_RE = /<mark\b[^>]*\bdata-hl\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/mark>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** The text a browser would report as `mark.textContent`. */
function markText(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]*>/g, ''));
}

export function collectHighlights(html: string): CollectedHighlight[] {
  if (!html) return [];
  const order: string[] = [];
  const texts = new Map<string, string>();

  for (const match of html.matchAll(MARK_RE)) {
    const id = match[1];
    const inner = match[2] ?? '';
    if (!id) continue;
    if (!texts.has(id)) {
      texts.set(id, '');
      order.push(id);
    }
    const prev = texts.get(id) ?? '';
    const next = markText(inner);
    texts.set(id, prev ? `${prev} ${next}` : next);
  }

  return order.map((id) => ({ id, text: (texts.get(id) ?? '').replace(/\s+/g, ' ').trim() }));
}
