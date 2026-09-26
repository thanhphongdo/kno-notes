/**
 * Vietnamese-insensitive normalisation used by the keyword scorer.
 *
 * TODO(integration): this is a local copy. The backend agent owns the canonical
 * implementation in `src/lib/text/` — once that module lands, the app agent
 * should replace this file's body with `export { norm } from '@/lib/text';`
 * (or re-point every import) so there is exactly one normaliser in the codebase.
 * The two must stay byte-for-byte equivalent: the server-side filter and the
 * client-side ranker have to agree on what "sốc" matches.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** lowercase → NFD → drop combining tone marks → `đ` becomes `d`. */
export function norm(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd');
}

/** `norm` plus whitespace collapsing — handy for building a haystack. */
export function normCollapsed(input: string): string {
  return norm(input).replace(/\s+/g, ' ').trim();
}

/** Normalised, whitespace-separated tokens. Empty for a blank string. */
export function tokens(input: string): string[] {
  return normCollapsed(input).split(' ').filter(Boolean);
}
