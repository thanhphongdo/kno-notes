// src/lib/offline/store.ts
//
// Tầng IndexedDB của kho offline.
//
// Cùng một tinh thần như `src/lib/search/vector-cache.ts`: mọi lời gọi đều bọc
// try/catch và rơi về một `Map` trong bộ nhớ khi không ghi được. Cửa sổ ẩn
// danh, site data bị chặn, Safari thu hồi dung lượng, vượt quota — tất cả đều
// hiện ra dưới dạng lỗi IndexedDB, và không cái nào được phép làm hỏng app.
// Mất kho chỉ có nghĩa là không đọc được khi ngoại tuyến, không phải app chết.

export const OFFLINE_DB_NAME = 'kno-notes-offline';
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_STORE = 'entries';

export interface StoredRow {
  key: string;
  [field: string]: unknown;
}

let memory = new Map<string, StoredRow>();
let persistent: boolean | null = null;

/** `false` khi đã có lời gọi IndexedDB thất bại; `null` khi chưa gọi lần nào. */
export function isOfflineStorePersistent(): boolean {
  return persistent === true;
}

/** Dùng cho test và cho lúc đăng xuất. */
export function __resetOfflineStore(): void {
  memory = new Map();
  persistent = null;
}

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = factory.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'key' });
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
 * Chạy `fn` trong MỘT transaction. `fn` phải phát mọi request một cách đồng
 * bộ — `await` giữa hai request có thể để transaction tự commit — nên nó trả
 * về promise chứ không tự chờ.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(OFFLINE_STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    const result = await fn(tx.objectStore(OFFLINE_STORE));
    await done;
    persistent = true;
    return result;
  } finally {
    db.close();
  }
}

export async function getRow<T extends StoredRow>(key: string): Promise<T | undefined> {
  try {
    return await withStore('readonly', (store) => settled<T | undefined>(store.get(key)));
  } catch {
    persistent = false;
    return memory.get(key) as T | undefined;
  }
}

export async function getRows<T extends StoredRow>(keys: readonly string[]): Promise<T[]> {
  if (keys.length === 0) return [];
  try {
    // Kiểu cụ thể hoá ở đây chứ không trong `withStore`: `Awaited<T>` của một
    // T generic thì TypeScript không rút gọn được, dù T luôn là object.
    const rows = await withStore<(StoredRow | undefined)[]>('readonly', (store) =>
      Promise.all(keys.map((key) => settled<StoredRow | undefined>(store.get(key)))),
    );
    return rows.filter((row): row is T => row != null);
  } catch {
    persistent = false;
    return keys.map((key) => memory.get(key)).filter((row): row is T => row != null);
  }
}

export async function putRows(rows: readonly StoredRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await withStore('readwrite', (store) =>
      Promise.all(rows.map((row) => settled(store.put(row)))).then(() => undefined),
    );
  } catch {
    persistent = false;
    for (const row of rows) memory.set(row.key, row);
  }
}

export async function deleteRows(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await withStore('readwrite', (store) =>
      Promise.all(keys.map((key) => settled(store.delete(key)))).then(() => undefined),
    );
  } catch {
    persistent = false;
    for (const key of keys) memory.delete(key);
  }
}

/** Khoá theo tiền tố, đã sắp xếp — hàng đợi dựa vào thứ tự này để phát lại. */
export async function keysWithPrefix(prefix: string): Promise<string[]> {
  try {
    return await withStore('readonly', (store) =>
      settled<IDBValidKey[]>(store.getAllKeys()).then((keys) =>
        keys.map(String).filter((key) => key.startsWith(prefix)).sort(),
      ),
    );
  } catch {
    persistent = false;
    return [...memory.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

/** Xoá sạch mọi thứ của một user — gọi khi đăng xuất. */
export async function deleteByPrefix(prefix: string): Promise<void> {
  await deleteRows(await keysWithPrefix(prefix));
}
