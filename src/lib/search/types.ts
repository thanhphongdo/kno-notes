/**
 * Structural types for the client-side search core.
 *
 * TODO(integration): these are declared locally on purpose — the backend agent
 * owns the canonical domain types in `src/lib/types.ts`. Once that file exists,
 * the app agent should re-point `SearchDoc` / `SearchIndexResponse` at it and
 * delete the local copies (they are intentionally structurally identical, so
 * the swap is a one-line import change).
 */

/** One row of `GET /api/search/index` — everything needed to rank and embed a note. */
export interface SearchDoc {
  noteId: string;
  title: string;
  desc: string;
  tags: string[];
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
