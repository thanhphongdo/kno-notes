import { norm, normCollapsed, tokens } from './normalize';
import type { RankableNote } from './types';

/**
 * Keyword scoring over title / description / tags.
 *
 * The ladder (highest wins):
 *   1.00  the query is the whole title
 *   0.90  the title starts with the query
 *   0.80  a tag equals the query
 *   0.75  the title contains the query
 *   0.70  every query token appears somewhere (title + desc + tags + highlights
 *         + image alts)
 *   0.60  a tag contains the query
 *   0.55  a highlighted passage contains the query
 *   0.50  an image's alt text contains the query
 *   0.45  the description contains the query
 *   0.00  otherwise
 *
 * Highlights sit between tags and description on purpose. A highlight is the
 * one piece of a note the reader chose by hand, so it outranks the description
 * — which is often boilerplate — but it is a fragment of prose rather than a
 * label, so a deliberate tag still wins. An alt sits just under it: also
 * written by hand, but describing a picture beside the argument rather than a
 * sentence the reader singled out of it.
 *
 * The multi-token rung is deliberately all-or-nothing. A partial token match
 * ("phản ứng dị nguyên" hitting only "phản"/"dị") is noise, not a keyword
 * signal — letting it through would drown the semantic half of the hybrid
 * score in near-misses. Queries like that are exactly what the vector side is
 * for, so the keyword score stays at 0 and the cosine carries the result.
 */

export const SCORE_TITLE_EXACT = 1;
export const SCORE_TITLE_PREFIX = 0.9;
export const SCORE_TAG_EXACT = 0.8;
export const SCORE_TITLE_SUBSTRING = 0.75;
export const SCORE_ALL_TOKENS = 0.7;
export const SCORE_TAG_SUBSTRING = 0.6;
export const SCORE_HIGHLIGHT_SUBSTRING = 0.55;
export const SCORE_IMAGE_ALT_SUBSTRING = 0.5;
export const SCORE_DESC_SUBSTRING = 0.45;

/** A `#`-prefixed query is tag-only and never consults vectors. */
export function isTagQuery(query: string): boolean {
  return query.trim().startsWith('#');
}

/** The normalised tag needle of a `#` query. A bare `#` yields `''` (match all). */
export function tagNeedle(query: string): string {
  return normCollapsed(query.trim().slice(1));
}

/** Does any of the note's tags contain `needle` (already normalised)? */
export function matchesTag(note: RankableNote, needle: string): boolean {
  if (!needle) return true;
  return note.tags.some((tag) => norm(tag).includes(needle));
}

/** 0..1. Diacritic- and case-insensitive. */
export function keywordScore(query: string, note: RankableNote): number {
  const q = normCollapsed(query);
  if (!q) return 0;

  const title = normCollapsed(note.title);
  const desc = normCollapsed(note.desc);
  const tags = note.tags.map((t) => normCollapsed(t));
  const highlights = (note.highlights ?? []).map((h) => normCollapsed(h));
  const imageAlts = (note.imageAlts ?? []).map((a) => normCollapsed(a));

  let score = 0;

  if (title === q) score = SCORE_TITLE_EXACT;
  else if (title.startsWith(q)) score = SCORE_TITLE_PREFIX;
  else if (title.includes(q)) score = SCORE_TITLE_SUBSTRING;

  if (tags.some((t) => t === q)) score = Math.max(score, SCORE_TAG_EXACT);
  else if (tags.some((t) => t.includes(q))) score = Math.max(score, SCORE_TAG_SUBSTRING);

  if (highlights.some((h) => h.includes(q))) score = Math.max(score, SCORE_HIGHLIGHT_SUBSTRING);

  if (imageAlts.some((a) => a.includes(q))) score = Math.max(score, SCORE_IMAGE_ALT_SUBSTRING);

  if (desc.includes(q)) score = Math.max(score, SCORE_DESC_SUBSTRING);

  const queryTokens = tokens(q);
  if (queryTokens.length > 1) {
    const haystack = `${title} ${desc} ${tags.join(' ')} ${highlights.join(' ')} ${imageAlts.join(' ')}`;
    if (queryTokens.every((t) => haystack.includes(t))) score = Math.max(score, SCORE_ALL_TOKENS);
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * The highlighted passage that explains why this note matched, in its original
 * spelling — the suggestion row shows it so the hit is not a mystery when the
 * query appears nowhere in the title.
 *
 * Substring first, all-tokens second: same ladder as `keywordScore`, so the
 * passage returned here is the one that actually earned the score.
 */
export function matchedHighlight(query: string, note: RankableNote): string | null {
  const q = normCollapsed(query);
  if (!q) return null;
  const list = note.highlights ?? [];
  if (list.length === 0) return null;

  const normalised = list.map((h) => normCollapsed(h));

  const direct = normalised.findIndex((h) => h.includes(q));
  if (direct !== -1) return list[direct] ?? null;

  const queryTokens = tokens(q);
  if (queryTokens.length > 1) {
    const all = normalised.findIndex((h) => queryTokens.every((t) => h.includes(t)));
    if (all !== -1) return list[all] ?? null;
  }

  return null;
}
