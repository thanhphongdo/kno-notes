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
 * Rail list source. The implementation is shared with the server-side search
 * index (`@/lib/text/highlights`) so the rail and the suggestion panel can
 * never disagree about what a highlight says. Re-exported here because this
 * module is where the highlight feature's callers already look.
 */
export { collectHighlights, type CollectedHighlight } from '@/lib/text';
