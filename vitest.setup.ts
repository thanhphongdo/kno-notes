import '@testing-library/jest-dom/vitest';

// jsdom does not implement Range.prototype.intersectsNode, which the highlight
// wrapper depends on. Reimplement it with boundary-point comparison so the
// highlight unit tests exercise the real algorithm.
if (typeof Range !== 'undefined' && !('intersectsNode' in Range.prototype)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Range.prototype as any).intersectsNode = function intersectsNode(node: Node): boolean {
    const ownerDocument = node.ownerDocument;
    if (!ownerDocument) return false;
    const nodeRange = ownerDocument.createRange();
    try {
      nodeRange.selectNode(node);
    } catch {
      nodeRange.selectNodeContents(node);
    }
    const startsBeforeEnd = this.compareBoundaryPoints(Range.START_TO_END, nodeRange) > -1;
    const endsAfterStart = this.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 1;
    nodeRange.detach?.();
    return startsBeforeEnd && endsAfterStart;
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  });
}
