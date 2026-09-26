'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEmbeddingWorker, embedText, getVectors, isSemanticSearchEnabled,
  pruneVectors, putVectors, staleDocs,
  type SearchDoc, type SearchIndexResponse, type WorkerRequest, type WorkerResponse,
} from '@/lib/search';

/** A slow embedding must never hold the suggestion panel hostage. */
export const QUERY_EMBED_TIMEOUT_MS = 1200;
/** Fallback when the browser has no `requestIdleCallback` (Safari). */
export const IDLE_FALLBACK_MS = 1500;

export interface SemanticSearch {
  /** True only while a live embedder can answer `embedQuery`. */
  ready: boolean;
  /** The keyword corpus. Present long before — and regardless of — any model. */
  docs: SearchDoc[];
  /** `noteId -> embedding`, or null while nothing has been embedded yet. */
  vectors: Map<string, Float32Array> | null;
  /** Resolves `null` whenever semantics are unavailable. Never rejects. */
  embedQuery: (text: string) => Promise<Float32Array | null>;
  /** Idempotent: starts the embedder if it is not running yet. */
  warmUp: () => void;
}

export interface UseSemanticSearchOptions {
  /**
   * Seam for tests: a fake embedder that speaks the worker protocol. Production
   * uses `createEmbeddingWorker`, which returns `null` — meaning "keyword-only
   * forever", not an error — when the kill switch is set or `Worker` is absent.
   */
  createWorker?: () => Worker | null;
}

function isSearchIndex(body: unknown): body is SearchIndexResponse {
  if (!body || typeof body !== 'object') return false;
  const { userId, items } = body as Partial<SearchIndexResponse>;
  return typeof userId === 'string' && Array.isArray(items);
}

function onIdle(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn);
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

/**
 * Owns the browser-side embedding pipeline. Semantics are an *enhancement*:
 * the metadata index is always fetched so keyword ranking works immediately,
 * the model is only started on idle or first focus, and every failure path —
 * no `Worker`, kill switch set, model download failed, worker crashed, slow
 * query — degrades to `vectors: null` / `queryVector: null`, which `hybridRank`
 * already reads as "keyword-only". Nothing here ever surfaces an error to the
 * user.
 */
export function useSemanticSearch(options: UseSemanticSearchOptions = {}): SemanticSearch {
  const { createWorker = createEmbeddingWorker } = options;

  const [docs, setDocs] = useState<SearchDoc[]>([]);
  const [vectors, setVectors] = useState<Map<string, Float32Array> | null>(null);
  const [ready, setReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const startedRef = useRef(false);
  const readyRef = useRef(false);
  const prunedRef = useRef(false);
  const userIdRef = useRef('');
  const docsRef = useRef<SearchDoc[]>([]);
  const batchRef = useRef(0);
  const queryIdRef = useRef(0);
  const pendingRef = useRef(new Map<number, (v: Float32Array | null) => void>());

  const mergeVectors = useCallback((rows: readonly { noteId: string; vector: Float32Array }[]) => {
    if (rows.length === 0) return;
    setVectors((prev) => {
      const next = new Map(prev ?? []);
      for (const row of rows) next.set(row.noteId, row.vector);
      return next;
    });
  }, []);

  // The metadata index is cheap and unconditional: keyword search needs it, and
  // the cached vectors it unlocks make the first render already semantic.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let data: SearchIndexResponse | null = null;
      try {
        const res = await fetch('/api/search/index');
        const body: unknown = res.ok ? await res.json() : null;
        // A truncated or unexpected body must degrade, not throw: keyword
        // search still has the server-rendered list on screen.
        data = isSearchIndex(body) ? body : null;
      } catch {
        data = null; // offline
      }
      if (cancelled || !data) return;
      const { userId, items } = data;
      userIdRef.current = userId;
      docsRef.current = items;
      setDocs(items);

      const cached = await getVectors(userId, items.map((d) => d.noteId));
      if (cancelled) return;
      mergeVectors([...cached.values()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [mergeVectors]);

  /** Re-embed only what moved on, prune what the user deleted, once. */
  const embedStale = useCallback(async () => {
    const worker = workerRef.current;
    const userId = userIdRef.current;
    const corpus = docsRef.current;
    if (!worker || !userId || corpus.length === 0) return;

    const noteIds = corpus.map((d) => d.noteId);
    const cached = await getVectors(userId, noteIds);
    mergeVectors([...cached.values()]);

    if (!prunedRef.current) {
      prunedRef.current = true;
      void pruneVectors(userId, noteIds);
    }

    const todo = staleDocs(corpus, cached);
    if (todo.length === 0) return;

    batchRef.current += 1;
    const request: WorkerRequest = {
      type: 'embedDocs',
      batchId: batchRef.current,
      docs: todo.map((d) => ({ noteId: d.noteId, contentSha: d.contentSha, text: embedText(d) })),
    };
    worker.postMessage(request);
  }, [mergeVectors]);

  const onMessage = useCallback(
    (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'ready':
          readyRef.current = true;
          setReady(true);
          void embedStale();
          break;
        case 'docsEmbedded':
          void putVectors(userIdRef.current, msg.vectors);
          mergeVectors(msg.vectors);
          break;
        case 'queryEmbedded': {
          const resolve = pendingRef.current.get(msg.queryId);
          if (!resolve) break;
          pendingRef.current.delete(msg.queryId);
          // A superseded query is worth nothing: the box has moved on.
          resolve(msg.queryId === queryIdRef.current ? msg.vector : null);
          break;
        }
        case 'error':
          // Semantics are an enhancement; the user sees keyword results, not a failure.
          readyRef.current = false;
          setReady(false);
          for (const resolve of pendingRef.current.values()) resolve(null);
          pendingRef.current.clear();
          break;
        default:
          break;
      }
    },
    [embedStale, mergeVectors],
  );

  const warmUp = useCallback(() => {
    if (startedRef.current) return;
    if (!isSemanticSearchEnabled()) return;
    startedRef.current = true;

    const worker = createWorker();
    if (!worker) return; // keyword-only, deliberately and permanently

    workerRef.current = worker;
    worker.addEventListener('message', onMessage as EventListener);
    worker.postMessage({ type: 'init' } satisfies WorkerRequest);
  }, [createWorker, onMessage]);

  // Warm up on the first idle moment after the corpus lands — never before
  // first paint, and never on the typing path.
  useEffect(() => {
    if (docs.length === 0) return;
    return onIdle(warmUp);
  }, [docs.length, warmUp]);

  // A note saved elsewhere changes `docs`; re-sync once the embedder is live.
  useEffect(() => {
    docsRef.current = docs;
    if (readyRef.current) void embedStale();
  }, [docs, embedStale]);

  useEffect(
    () => () => {
      const worker = workerRef.current;
      if (!worker) return;
      workerRef.current = null;
      worker.postMessage({ type: 'dispose' } satisfies WorkerRequest);
      worker.terminate();
    },
    [],
  );

  const embedQuery = useCallback(async (text: string): Promise<Float32Array | null> => {
    const worker = workerRef.current;
    if (!worker || !readyRef.current || !text.trim()) return null;

    queryIdRef.current += 1;
    const queryId = queryIdRef.current;

    return new Promise<Float32Array | null>((resolve) => {
      pendingRef.current.set(queryId, resolve);
      worker.postMessage({ type: 'embedQuery', queryId, text } satisfies WorkerRequest);
      setTimeout(() => {
        if (pendingRef.current.delete(queryId)) resolve(null);
      }, QUERY_EMBED_TIMEOUT_MS);
    });
  }, []);

  return { ready, docs, vectors, embedQuery, warmUp };
}
