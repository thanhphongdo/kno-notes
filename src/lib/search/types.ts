/**
 * Structural types for the client-side search core.
 *
 * These are declared locally on purpose: the search core is standalone and
 * never imports the domain types. `SearchDoc` / `SearchIndexResponse` are kept
 * structurally identical to `src/lib/types.ts` by hand — change one, change the
 * other, or `GET /api/search/index` and the ranker drift apart silently.
 */

/** One row of `GET /api/search/index` — everything needed to rank and embed a note. */
export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
  /** Drives the coloured dot on a suggestion row. */
  priority: 'high' | 'medium' | 'low';
  /** ISO-8601 — the `rel()` half of the sub-line, and the idle sort key. */
  updated: string;
  /** sha over `title \n desc \n tags.join(',') \n plain`, with `<mark>` stripped. */
  contentSha: string;
  /** HTML-stripped body, already truncated to ~2000 chars by the server. */
  plain: string;
}

/** The payload of `GET /api/search/index`. */
export interface SearchIndexResponse {
  userId: string;
  items: SearchDoc[];
}

/** The minimum a document needs to be keyword-ranked. `SearchDoc` satisfies it. */
export interface RankableNote {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
}

/** A ranked document: the input row, widened with its three scores. */
export type Ranked<T extends RankableNote = RankableNote> = T & {
  /** `0.6 * keyword + 0.4 * max(0, cosine)`, or `keyword` alone when `cosine` is null. */
  score: number;
  /** 0..1 */
  keyword: number;
  /** -1..1, or null when no vector was consulted (model not ready, disabled, or a #tag query). */
  cosine: number | null;
};

/** Plan-compatible alias. */
export type RankedNote = Ranked<RankableNote>;
