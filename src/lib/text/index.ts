// src/lib/text/index.ts
//
// Client-safe text helpers ONLY. Everything re-exported here must be pure and
// dependency-free so client components can import it without dragging a
// server-side DOM implementation into the browser bundle.
//
// HTML parsing (sections/stripHtml) needs `linkedom` and
// lives in `@/lib/text/server`. Importing it from a client component would add
// ~150 kB of DOM emulation to the page and pull in linkedom's optional
// `canvas` dependency, which does not resolve in a browser build.
export { norm, clip, slugify } from './normalize';
export { fmt, rel } from './date';
export { shuffle } from './array';
export {
  collectHighlights, highlightTexts, HIGHLIGHT_INDEX_CHARS, HIGHLIGHT_INDEX_MAX,
  type CollectedHighlight,
} from './highlights';
