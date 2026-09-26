// src/lib/text/server.ts
//
// Server-only text helpers. These parse HTML with `linkedom` and must never be
// imported from a client component — see the note in `./index.ts`.
export { sections, stripHtml, extractHighlights, type Section } from './html';
