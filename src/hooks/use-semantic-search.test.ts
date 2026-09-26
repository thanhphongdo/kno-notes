import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { E5_PASSAGE_PREFIX, embedText, type SearchDoc, type WorkerRequest } from '@/lib/search';
import { useSemanticSearch } from './use-semantic-search';

/**
 * A fake embedder. It speaks the real `WorkerRequest`/`WorkerResponse`
 * protocol and returns deterministic unit vectors, so the hybrid wiring is
 * exercised end to end without a single byte of model download.
 */
class FakeEmbedder {
  sent: WorkerRequest[] = [];
  terminated = false;
  private listeners: ((e: MessageEvent) => void)[] = [];

  addEventListener(_type: 'message', fn: (e: MessageEvent) => void) {
    this.listeners.push(fn);
  }

  removeEventListener() {}

  terminate() {
    this.terminated = true;
  }

  postMessage(msg: WorkerRequest) {
    this.sent.push(msg);
  }

  /** Push a response back to the main thread, the way a real worker would. */
  emit(data: unknown) {
    for (const fn of this.listeners) fn({ data } as MessageEvent);
  }

  asWorker(): Worker {
    return this as unknown as Worker;
  }
}

const vec = (n: number) => Float32Array.from([n, 0, 0]);

const items: SearchDoc[] = [
  { noteId: 'n1', title: 'Sốc phản vệ', desc: 'Adrenalin', tags: ['Cấp cứu'], contentSha: 's1', plain: 'a' },
  { noteId: 'n2', title: 'Đọc ECG', desc: 'Trình tự', tags: ['ECG'], contentSha: 's2', plain: 'b' },
];

const okFetch = () =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: 'u1', items }) });

describe('useSemanticSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch());
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('loads the metadata index so keyword search works before any model does', async () => {
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => null }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    expect(fetch).toHaveBeenCalledWith('/api/search/index');
  });

  it('survives a failing index fetch without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => null }));
    await waitFor(() => expect(result.current.docs).toEqual([]));
    expect(result.current.vectors).toBeNull();
    expect(result.current.ready).toBe(false);
  });

  describe('when the embedder is unavailable (createEmbeddingWorker returns null)', () => {
    it('stays keyword-only forever and never reports an error', async () => {
      const { result } = renderHook(() => useSemanticSearch({ createWorker: () => null }));
      await waitFor(() => expect(result.current.docs).toHaveLength(2));
      act(() => result.current.warmUp());
      expect(result.current.ready).toBe(false);
      await expect(result.current.embedQuery('sốc')).resolves.toBeNull();
    });
  });

  it('never constructs a worker when NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH', '1');
    const createWorker = vi.fn(() => new FakeEmbedder().asWorker());
    const { result } = renderHook(() => useSemanticSearch({ createWorker }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => result.current.warmUp());
    expect(createWorker).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it('embeds only the documents whose contentSha is not cached, prefix-free', async () => {
    const worker = new FakeEmbedder();
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => worker.asWorker() }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));

    act(() => result.current.warmUp());
    expect(worker.sent).toEqual([{ type: 'init' }]);

    act(() => worker.emit({ type: 'ready' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(worker.sent).toHaveLength(2));

    const batch = worker.sent[1];
    expect(batch?.type).toBe('embedDocs');
    if (batch?.type !== 'embedDocs') throw new Error('unreachable');
    expect(batch.docs.map((d) => d.noteId)).toEqual(['n1', 'n2']);
    expect(batch.docs[0]?.text).toBe(embedText(items[0]!));
    // The `passage: ` prefix is the worker's job, never the caller's.
    expect(batch.docs[0]?.text.startsWith(E5_PASSAGE_PREFIX)).toBe(false);
  });

  it('merges embedded documents into the vector map', async () => {
    const worker = new FakeEmbedder();
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => worker.asWorker() }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => result.current.warmUp());
    act(() => worker.emit({ type: 'ready' }));
    await waitFor(() => expect(worker.sent).toHaveLength(2));

    act(() =>
      worker.emit({
        type: 'docsEmbedded',
        batchId: 1,
        vectors: [{ noteId: 'n1', contentSha: 's1', vector: vec(1) }],
      }),
    );
    await waitFor(() => expect(result.current.vectors?.get('n1')).toEqual(vec(1)));
  });

  it('resolves embedQuery with the worker vector and drops superseded queries', async () => {
    const worker = new FakeEmbedder();
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => worker.asWorker() }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => result.current.warmUp());
    act(() => worker.emit({ type: 'ready' }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const first = result.current.embedQuery('so');
    const second = result.current.embedQuery('sốc');
    const queries = worker.sent.filter((m) => m.type === 'embedQuery');
    expect(queries).toHaveLength(2);

    act(() => worker.emit({ type: 'queryEmbedded', queryId: 1, vector: vec(9) }));
    act(() => worker.emit({ type: 'queryEmbedded', queryId: 2, vector: vec(2) }));

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(vec(2));
  });

  it('falls back to keyword-only on a worker error instead of surfacing a failure', async () => {
    const worker = new FakeEmbedder();
    const { result } = renderHook(() => useSemanticSearch({ createWorker: () => worker.asWorker() }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => result.current.warmUp());
    act(() => worker.emit({ type: 'ready' }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const pending = result.current.embedQuery('sốc');
    act(() => worker.emit({ type: 'error', message: 'out of memory' }));

    await expect(pending).resolves.toBeNull();
    await waitFor(() => expect(result.current.ready).toBe(false));
    await expect(result.current.embedQuery('sốc')).resolves.toBeNull();
  });

  it('creates the worker at most once however often warmUp is called', async () => {
    const createWorker = vi.fn(() => new FakeEmbedder().asWorker());
    const { result } = renderHook(() => useSemanticSearch({ createWorker }));
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => {
      result.current.warmUp();
      result.current.warmUp();
      result.current.warmUp();
    });
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('disposes the worker on unmount', async () => {
    const worker = new FakeEmbedder();
    const { result, unmount } = renderHook(() =>
      useSemanticSearch({ createWorker: () => worker.asWorker() }),
    );
    await waitFor(() => expect(result.current.docs).toHaveLength(2));
    act(() => result.current.warmUp());
    unmount();
    expect(worker.sent.at(-1)).toEqual({ type: 'dispose' });
    expect(worker.terminated).toBe(true);
  });
});
