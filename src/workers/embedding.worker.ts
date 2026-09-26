/**
 * The embedding Web Worker.
 *
 * Loads `Xenova/multilingual-e5-small` (q8) lazily — the ~30 MB of weights are
 * fetched only when an `init` message arrives, and the browser caches them via
 * the Cache API afterwards (SPEC §2.3). Nothing here runs on the main thread,
 * so a cold model never blocks typing.
 *
 * Kill switch: this worker must never be constructed when
 * `NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH === '1'` (contracts §4). The main-thread
 * factory in `@/lib/search/embedder-client` enforces that; the guard below is
 * the second lock — if the worker is somehow spawned anyway it refuses to fetch
 * the model and answers every request with an error instead.
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { l2Normalize } from '@/lib/search/cosine';
import {
  EMBEDDING_DIM,
  EMBED_BATCH_SIZE,
  MODEL_ID,
  isSemanticSearchEnabled,
  passageInput,
  queryInput,
  type EmbedDoc,
  type EmbeddedDoc,
  type WorkerRequest,
  type WorkerResponse,
} from '@/lib/search/worker-protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Remote weights only; there is no `/models` directory to fall back to.
env.allowLocalModels = false;

interface ProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (data: unknown) => {
        const p = data as ProgressEvent;
        if (p.status === 'progress' && typeof p.loaded === 'number' && typeof p.total === 'number') {
          post({ type: 'progress', loaded: p.loaded, total: p.total, file: p.file });
        }
      },
    });
  }
  return extractorPromise;
}

/**
 * Embeds a batch of already-prefixed strings.
 * `pooling: 'mean'` + `normalize: true` does the mean pooling and the L2
 * normalisation inside the pipeline; `l2Normalize` below is idempotent and
 * guards against that default ever changing — cosine similarity assumes unit
 * vectors, and a silently un-normalised batch would be very hard to spot.
 */
async function embed(inputs: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const tensor = await extractor(inputs, { pooling: 'mean', normalize: true });
  const data = tensor.data as Float32Array;
  const dim = tensor.dims[tensor.dims.length - 1] ?? EMBEDDING_DIM;

  const out: Float32Array[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    out.push(l2Normalize(data.slice(i * dim, (i + 1) * dim)));
  }
  return out;
}

async function embedDocs(batchId: number, docs: EmbedDoc[]): Promise<void> {
  const vectors: EmbeddedDoc[] = [];
  for (let start = 0; start < docs.length; start += EMBED_BATCH_SIZE) {
    const slice = docs.slice(start, start + EMBED_BATCH_SIZE);
    const embeddings = await embed(slice.map((doc) => passageInput(doc.text)));
    slice.forEach((doc, i) => {
      vectors.push({ noteId: doc.noteId, contentSha: doc.contentSha, vector: embeddings[i]! });
    });
    post({ type: 'progress', loaded: Math.min(start + slice.length, docs.length), total: docs.length });
  }
  post({ type: 'docsEmbedded', batchId, vectors }, vectors.map((v) => v.vector.buffer));
}

async function embedQuery(queryId: number, text: string): Promise<void> {
  const [vector] = await embed([queryInput(text)]);
  post({ type: 'queryEmbedded', queryId, vector: vector! }, [vector!.buffer]);
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (!isSemanticSearchEnabled()) {
    post({ type: 'error', message: 'Semantic search is disabled (NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH=1)' });
    return;
  }

  switch (request.type) {
    case 'init':
      void getExtractor().then(
        () => post({ type: 'ready' }),
        (error: unknown) => post({ type: 'error', message: message(error) }),
      );
      return;

    case 'embedDocs':
      void embedDocs(request.batchId, request.docs).catch((error: unknown) =>
        post({ type: 'error', message: message(error), batchId: request.batchId }),
      );
      return;

    case 'embedQuery':
      void embedQuery(request.queryId, request.text).catch((error: unknown) =>
        post({ type: 'error', message: message(error), queryId: request.queryId }),
      );
      return;

    case 'dispose':
      extractorPromise = null;
      ctx.close();
      return;
  }
});
