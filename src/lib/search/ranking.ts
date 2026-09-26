/**
 * Compatibility shim: `part-3-app.md` task A14 names this module `ranking.ts`.
 * The implementation lives in the three focused modules below.
 */
export { cosineSimilarity, l2Normalize } from './cosine';
export { keywordScore, isTagQuery, tagNeedle, matchesTag } from './keyword';
export { hybridRank, KEYWORD_WEIGHT, VECTOR_WEIGHT } from './hybrid';
export type { RankableNote, Ranked, RankedNote } from './types';
