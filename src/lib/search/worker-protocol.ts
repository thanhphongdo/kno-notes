/**
 * The typed message protocol between the main thread and the embedding worker.
 *
 * This module is imported by BOTH sides, so it must stay free of DOM, Node and
 * `@huggingface/transformers` imports.
 *
 * ── e5 prefixes (contracts §4, SPEC §2.3) ────────────────────────────────────
 * `multilingual-e5-small` was trained with asymmetric prefixes. Documents must
 * be embedded as `passage: <text>` and queries as `query: <text>`. Omitting them
 * does not error — it silently collapses the two into one space and relevance
 * degrades badly, which is precisely the kind of bug nobody notices in review.
 * `passageInput()` / `queryInput()` are the only sanctioned way to build model
 * input; the worker calls them and never concatenates prefixes by hand.
 */

export const MODEL_ID = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIM = 384;
export const E5_QUERY_PREFIX = 'query: ';
export const E5_PASSAGE_PREFIX = 'passage: ';
/** ≈512 tokens of Vietnamese. Matches the server-side `plain` truncation. */
export const MAX_PLAIN_CHARS = 2000;
/** How many passages the worker embeds per `embedDocs` batch before yielding. */
export const EMBED_BATCH_SIZE = 8;

/** One note queued for embedding. */
export interface EmbedDoc {
  noteId: string;
  contentSha: string;
  /** Already built with `embedText()`; the worker adds the `passage: ` prefix. */
  text: string;
}

/** One embedded note, as it comes back from the worker. */
export interface EmbeddedDoc {
  noteId: string;
  contentSha: string;
  vector: Float32Array;
}

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'embedDocs'; batchId: number; docs: EmbedDoc[] }
  | { type: 'embedQuery'; queryId: number; text: string }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; loaded: number; total: number; file?: string }
  | { type: 'docsEmbedded'; batchId: number; vectors: EmbeddedDoc[] }
  | { type: 'queryEmbedded'; queryId: number; vector: Float32Array }
  | { type: 'error'; message: string; batchId?: number; queryId?: number };

/**
 * The passage text for one note: title, description, tags and the head of the
 * plaintext body, whitespace-collapsed. Unprefixed — pass it to
 * `passageInput()` before handing it to the model.
 */
export function embedText(doc: { title: string; desc: string; tags: string[]; plain: string }): string {
  const tags = doc.tags.join(', ');
  const body = doc.plain.slice(0, MAX_PLAIN_CHARS);
  return `${doc.title}. ${doc.desc}. ${tags}. ${body}`.replace(/\s+/g, ' ').trim();
}

/** `passage: <text>` — the e5 document prefix. Idempotent. */
export function passageInput(text: string): string {
  return text.startsWith(E5_PASSAGE_PREFIX) ? text : `${E5_PASSAGE_PREFIX}${text}`;
}

/** `query: <text>` — the e5 query prefix. Trims first; idempotent. */
export function queryInput(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith(E5_QUERY_PREFIX) ? trimmed : `${E5_QUERY_PREFIX}${trimmed}`;
}

/**
 * The single kill switch for the whole semantic path (contracts §4).
 * When `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH === '1'` no worker may be
 * constructed and no model may be fetched — Playwright always sets it, so a CI
 * run can never pull ~120 MB of weights.
 */
export function isSemanticSearchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH !== '1';
}
