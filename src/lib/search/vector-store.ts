/**
 * Compatibility shim: `part-3-app.md` task A14 names this module
 * `vector-store.ts`. The implementation lives in `vector-cache.ts`.
 *
 * One deliberate deviation from the plan: the stored field is `contentSha`, not
 * `sha`, so it matches `SearchDoc.contentSha` and `GET /api/search/index`.
 */
export * from './vector-cache';
