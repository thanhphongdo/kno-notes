import { cosineSimilarity } from './cosine';
import { isTagQuery, keywordScore, matchesTag, tagNeedle } from './keyword';
import type { Ranked, RankableNote } from './types';

/** SPEC §2.3: `score = 0.6 * keyword + 0.4 * cosine`. */
export const KEYWORD_WEIGHT = 0.6;
export const VECTOR_WEIGHT = 0.4;

export interface HybridRankOptions<T extends RankableNote = RankableNote> {
  query: string;
  docs: readonly T[];
  /** `noteId -> embedding`. `null` while the embedder is cold or disabled. */
  vectors: ReadonlyMap<string, Float32Array> | null;
  /** The embedded query. `null` while the embedder is cold or disabled. */
  queryVector: Float32Array | null;
  /** Optional cap applied after sorting. */
  maxResults?: number;
}

export function hybridRank<T extends RankableNote>(options: HybridRankOptions<T>): Ranked<T>[];
export function hybridRank<T extends RankableNote>(
  query: string,
  docs: readonly T[],
  vectors: ReadonlyMap<string, Float32Array> | null,
  queryVector: Float32Array | null,
  maxResults?: number,
): Ranked<T>[];
/**
 * Hybrid keyword + semantic ranking.
 *
 * - An empty query returns every document, in input order, with score 0.
 * - A `#tag` query filters by tag and never touches the vectors.
 * - When `vectors` or `queryVector` is null the score degrades to keyword-only;
 *   `cosine` is reported as `null` so the UI can tell "no semantics yet" apart
 *   from "semantically unrelated". It never throws for a missing embedder.
 * - A negative cosine is clamped to 0 so semantics can only ever add.
 * - Sorting is stable: ties keep input order.
 */
export function hybridRank<T extends RankableNote>(
  a: HybridRankOptions<T> | string,
  b?: readonly T[],
  c?: ReadonlyMap<string, Float32Array> | null,
  d?: Float32Array | null,
  e?: number,
): Ranked<T>[] {
  const options: HybridRankOptions<T> =
    typeof a === 'string'
      ? { query: a, docs: b ?? [], vectors: c ?? null, queryVector: d ?? null, maxResults: e }
      : a;

  const { docs, vectors, queryVector, maxResults } = options;
  const query = options.query.trim();

  const limit = (rows: Ranked<T>[]): Ranked<T>[] =>
    maxResults != null && maxResults >= 0 ? rows.slice(0, maxResults) : rows;

  if (!query) {
    return limit(docs.map((doc) => ({ ...doc, score: 0, keyword: 0, cosine: null })));
  }

  if (isTagQuery(query)) {
    const needle = tagNeedle(query);
    return limit(
      docs.filter((doc) => matchesTag(doc, needle)).map((doc) => ({ ...doc, score: 1, keyword: 1, cosine: null })),
    );
  }

  const ranked = docs.map((doc, index) => {
    const keyword = keywordScore(query, doc);
    const vector = vectors != null ? vectors.get(doc.noteId) ?? null : null;
    const cosine = queryVector != null && vector != null ? cosineSimilarity(queryVector, vector) : null;
    const score = cosine == null ? keyword : KEYWORD_WEIGHT * keyword + VECTOR_WEIGHT * Math.max(0, cosine);
    return { row: { ...doc, score, keyword, cosine } as Ranked<T>, index };
  });

  return limit(
    ranked
      .filter((r) => r.row.score > 0)
      .sort((x, y) => y.row.score - x.row.score || x.index - y.index)
      .map((r) => r.row),
  );
}
