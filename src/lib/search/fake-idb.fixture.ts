/**
 * A minimal, dependency-free IndexedDB double for unit tests.
 *
 * It implements only the surface `vector-cache.ts` touches: `open`,
 * `createObjectStore`/`createIndex`, and a transaction exposing
 * `get` / `put` / `delete` / `getAllKeys`. Requests resolve on a microtask,
 * like the real thing, and the transaction completes once nothing is pending.
 *
 * Not a test file: the vitest `include` glob only collects `*.test.ts`.
 */

interface StoredRow { key: string; [field: string]: unknown }

type Listener = (() => void) | null;

interface FakeRequest<T> {
  result: T;
  error: DOMException | null;
  onsuccess: Listener;
  onerror: Listener;
  onupgradeneeded: Listener;
}

let data = new Map<string, StoredRow>();
let storeCreated = false;
let saved: IDBFactory | undefined;
let installed = false;

function makeRequest<T>(): FakeRequest<T> {
  return { result: undefined as T, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
}

function makeStore(onSettle: () => void, track: () => void) {
  const settle = <T>(req: FakeRequest<T>, value: T) => {
    track();
    queueMicrotask(() => {
      req.result = value;
      req.onsuccess?.();
      onSettle();
    });
    return req;
  };

  const store = {
    keyPath: 'key',
    createIndex: () => undefined,
    get(key: string) {
      const row = data.get(key);
      return settle(makeRequest<StoredRow | undefined>(), row ? { ...row } : undefined);
    },
    put(value: StoredRow) {
      data.set(value.key, { ...value });
      return settle(makeRequest<string>(), value.key);
    },
    delete(key: string) {
      data.delete(key);
      return settle(makeRequest<undefined>(), undefined);
    },
    getAllKeys() {
      return settle(makeRequest<IDBValidKey[]>(), [...data.keys()]);
    },
  };
  return store;
}

function makeDb() {
  const db = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => {
      storeCreated = true;
      return makeStore(() => undefined, () => undefined);
    },
    close: () => undefined,
    transaction: () => {
      let pending = 0;
      let done = false;
      const tx = { objectStore: () => store, oncomplete: null as Listener, onerror: null as Listener, onabort: null as Listener, error: null };
      const check = () => {
        queueMicrotask(() => {
          if (!done && pending === 0) { done = true; tx.oncomplete?.(); }
        });
      };
      const store = makeStore(() => { pending -= 1; check(); }, () => { pending += 1; });
      check();
      return tx;
    },
  };
  return db;
}

export function installFakeIndexedDb(options: { failOpen?: boolean } = {}): void {
  if (!installed) {
    saved = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    installed = true;
  }
  data = new Map();
  storeCreated = false;

  const factory = {
    open: () => {
      const req = makeRequest<unknown>();
      queueMicrotask(() => {
        if (options.failOpen) {
          req.error = new Error('quota') as unknown as DOMException;
          req.onerror?.();
          return;
        }
        const db = makeDb();
        req.result = db;
        if (!storeCreated) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };

  (globalThis as { indexedDB?: unknown }).indexedDB = factory;
}

export function uninstallFakeIndexedDb(): void {
  if (installed) {
    if (saved === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
    else (globalThis as { indexedDB?: unknown }).indexedDB = saved;
    installed = false;
    saved = undefined;
  } else {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  }
  data = new Map();
  storeCreated = false;
}
