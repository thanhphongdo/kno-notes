import { isSemanticSearchEnabled } from './worker-protocol';

/**
 * Main-thread factory for the embedding worker.
 *
 * Returns `null` — and therefore never constructs a `Worker`, never fetches a
 * byte of the model — when semantic search is disabled (contracts §4:
 * Playwright always sets `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1`) or when the
 * environment has no `Worker` at all (SSR, jsdom).
 *
 * Callers must treat `null` as "keyword-only mode", not as an error: pass
 * `vectors: null, queryVector: null` to `hybridRank` and the UI is identical.
 */
export function createEmbeddingWorker(): Worker | null {
  if (!isSemanticSearchEnabled()) return null;
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../../workers/embedding.worker.ts', import.meta.url), {
      type: 'module',
      name: 'kno-embedder',
    });
  } catch {
    return null;
  }
}
