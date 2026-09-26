import type { SearchDoc } from './types';

/**
 * The embedding cache: IndexedDB keyed `${userId}:${noteId}`, holding
 * `{ contentSha, vector }`. A note is re-embedded only when its `contentSha`
 * changes (SPEC §2.3).
 *
 * Every call is wrapped in try/catch. Private-browsing windows, blocked site
 * data, Safari's storage eviction and quota errors all surface as thrown or
 * rejected IndexedDB calls; none of them may break search. When persistence is
 * unavailable the module transparently falls back to a process-lifetime
 * in-memory `Map`, so semantic search still works — it just re-embeds after a
 * reload.
 */

export const VECTOR_DB_NAME = 'kno-notes-embeddings';
export const VECTOR_DB_VERSION = 1;
export const VECTOR_STORE = 'vectors';

export interface StoredVector {
  /** `${userId}:${noteId}` */
  key: string;
  userId: string;
  noteId: string;
  contentSha: string;
  vector: Float32Array;
  updatedAt: number;
}

export interface VectorRow {
  noteId: string;
  contentSha: string;
  vector: Float32Array;
}

/** The user-scoped primary key. Never query without the `userId` half. */
export function vectorKey(userId: string, noteId: string): string {
  return `${userId}:${noteId}`;
}

/** Documents whose embedding is missing or whose `contentSha` moved on. */
export function staleDocs(docs: readonly SearchDoc[], cached: ReadonlyMap<string, StoredVector>): SearchDoc[] {
  return docs.filter((doc) => cached.get(doc.noteId)?.contentSha !== doc.contentSha);
}

// ── in-memory fallback ───────────────────────────────────────────────────────

let memory = new Map<string, StoredVector>();
let persistent: boolean | null = null;

/** `false` once any IndexedDB call has failed; `null` until the first call. */
export function isVectorCachePersistent(): boolean {
  return persistent === true;
}

/** Test/logout helper: drops the in-memory fallback and the persistence verdict. */
export function __resetVectorCache(): void {
  memory = new Map();
  persistent = null;
}

// ── IndexedDB plumbing ───────────────────────────────────────────────────────

export function openVectorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = factory.open(VECTOR_DB_NAME, VECTOR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VECTOR_STORE)) {
        const store = db.createObjectStore(VECTOR_STORE, { keyPath: 'key' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

const settled = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/**
 * Runs `fn` inside one transaction. `fn` must issue all of its requests
 * synchronously — awaiting between two requests can let the transaction
 * auto-commit — so it returns the promises rather than awaiting them itself.
 */
async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openVectorDb();
  try {
    const tx = db.transaction(VECTOR_STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    const result = await fn(tx.objectStore(VECTOR_STORE));
    await done;
    persistent = true;
    return result;
  } finally {
    db.close();
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export async function getVectors(userId: string, noteIds: readonly string[]): Promise<Map<string, StoredVector>> {
  if (noteIds.length === 0) return new Map();
  try {
    return await withStore('readonly', (store) => {
      const pending = noteIds.map((noteId) => settled<StoredVector | undefined>(store.get(vectorKey(userId, noteId))));
      return Promise.all(pending).then((rows) => {
        const out = new Map<string, StoredVector>();
        for (const row of rows) {
          if (row && row.userId === userId) out.set(row.noteId, { ...row, vector: new Float32Array(row.vector) });
        }
        return out;
      });
    });
  } catch {
    persistent = false;
    const out = new Map<string, StoredVector>();
    for (const noteId of noteIds) {
      const row = memory.get(vectorKey(userId, noteId));
      if (row) out.set(noteId, row);
    }
    return out;
  }
}

export async function putVectors(userId: string, rows: readonly VectorRow[]): Promise<void> {
  if (rows.length === 0) return;
  const records = rows.map<StoredVector>((r) => ({
    key: vectorKey(userId, r.noteId),
    userId,
    noteId: r.noteId,
    contentSha: r.contentSha,
    vector: r.vector,
    updatedAt: Date.now(),
  }));
  try {
    await withStore('readwrite', (store) => {
      const pending = records.map((record) => settled(store.put(record)));
      return Promise.all(pending).then(() => undefined);
    });
  } catch {
    persistent = false;
    for (const record of records) memory.set(record.key, record);
  }
}

/** Drops cached vectors for notes the user no longer has. Best effort. */
export async function pruneVectors(userId: string, keepNoteIds: readonly string[]): Promise<void> {
  const keep = new Set(keepNoteIds);
  const prefix = `${userId}:`;
  const doomed = (key: string) => key.startsWith(prefix) && !keep.has(key.slice(prefix.length));
  try {
    const keys = await withStore('readonly', (store) =>
      settled<IDBValidKey[]>(store.getAllKeys()).then((all) => all.map(String).filter(doomed)),
    );
    if (keys.length === 0) return;
    await withStore('readwrite', (store) => Promise.all(keys.map((key) => settled(store.delete(key)))).then(() => undefined));
  } catch {
    persistent = false;
    for (const key of [...memory.keys()]) if (doomed(key)) memory.delete(key);
  }
}
