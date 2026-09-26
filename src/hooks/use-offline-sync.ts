'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listCachedNotes } from '@/lib/offline/cache';
import { enqueue, pendingWrites, type NewQueuedWrite } from '@/lib/offline/queue';
import { IMAGE_PREFIX, META_PREFIX, NOTE_PREFIX, QUEUE_PREFIX, scopePrefix } from '@/lib/offline/keys';
import { deleteByPrefix } from '@/lib/offline/store';
import { prefetchNotes, replayQueue } from '@/lib/offline/sync';

/** Nơi nhớ user id để màn hình ngoại tuyến biết đọc kho của ai. */
export const OFFLINE_USER_KEY = 'kn-offline-user';

/** Không tải lại toàn bộ mỗi lần chuyển tab — nửa giờ là đủ tươi. */
export const RESYNC_AFTER_MS = 30 * 60 * 1000;

/** Chờ khi trình duyệt không có `requestIdleCallback` (Safari). */
const IDLE_FALLBACK_MS = 3000;

export type SyncPhase = 'idle' | 'syncing' | 'ready' | 'offline';

export interface OfflineSync {
  online: boolean;
  phase: SyncPhase;
  /** Số ghi chú đã có sẵn để đọc khi mất mạng. */
  cached: number;
  /** Tổng số ghi chú của user, theo lần đồng bộ gần nhất. */
  total: number;
  /** Số thao tác đã làm lúc ngoại tuyến, đang chờ gửi lên. */
  pending: number;
  /** Đồng bộ ngay, không chờ lúc rảnh. */
  syncNow: () => void;
  /** Xếp một thao tác vào hàng đợi để gửi khi có mạng. `false` nếu không xếp được. */
  queueWrite: (write: NewQueuedWrite) => Promise<boolean>;
  /** Xoá sạch bản sao ngoại tuyến của user — gọi khi đăng xuất. */
  forget: () => Promise<void>;
}

export interface UseOfflineSyncOptions {
  enabled?: boolean;
  /** Seam cho test. */
  fetcher?: typeof fetch;
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

function readStoredUser(): string | null {
  try {
    return localStorage.getItem(OFFLINE_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Giữ một bản sao ghi chú trên máy, và đẩy lên những gì đã làm lúc mất mạng.
 *
 * Ba nguyên tắc:
 *  • Tải trước chỉ chạy lúc rảnh (`requestIdleCallback`) và không bao giờ
 *    chặn màn hình. Mất mạng giữa chừng thì lần sau chạy tiếp phần còn thiếu.
 *  • Đẩy TRƯỚC, kéo SAU. Nếu kéo trước, bản máy chủ sẽ ghi đè đúng thứ mình
 *    chưa kịp gửi lên.
 *  • Khi trực tuyến luôn lấy bản mới nhất và ghi lại số phiên bản, nên lúc
 *    chuyển sang ngoại tuyến thứ đọc được đúng là thứ vừa nhìn thấy.
 */
export function useOfflineSync(options: UseOfflineSyncOptions = {}): OfflineSync {
  const { enabled = true, fetcher } = options;

  const [online, setOnline] = useState(true);
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [cached, setCached] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);

  const userId = useRef<string | null>(null);
  const running = useRef(false);
  const lastSync = useRef(0);

  const refreshCounts = useCallback(async (id: string) => {
    const [notes, queue] = await Promise.all([listCachedNotes(id), pendingWrites(id)]);
    setCached(notes.length);
    setPending(queue.length);
    return notes.length;
  }, []);

  const resolveUser = useCallback(async (): Promise<string | null> => {
    if (userId.current) return userId.current;
    const stored = readStoredUser();
    if (stored) userId.current = stored;

    try {
      const res = await (fetcher ?? fetch)('/api/auth/me');
      if (res.ok) {
        const body = (await res.json()) as { user?: { id?: string } };
        const id = body.user?.id;
        if (id) {
          userId.current = id;
          try {
            localStorage.setItem(OFFLINE_USER_KEY, id);
          } catch {
            /* site data bị chặn — vẫn chạy được trong phiên này */
          }
        }
      }
    } catch {
      /* ngoại tuyến: dùng id đã nhớ từ lần trước, nếu có */
    }
    return userId.current;
  }, [fetcher]);

  const run = useCallback(
    async (force: boolean) => {
      if (running.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const id = await resolveUser();
        if (id) await refreshCounts(id);
        setPhase('offline');
        return;
      }
      if (!force && Date.now() - lastSync.current < RESYNC_AFTER_MS) return;

      running.current = true;
      setPhase('syncing');
      try {
        const id = await resolveUser();
        if (!id) return;

        // Đẩy trước, kéo sau — xem chú thích ở đầu hàm.
        await replayQueue(id, fetcher);
        const result = await prefetchNotes(id, fetcher);
        setTotal(result.total);
        await refreshCounts(id);
        if (!result.interrupted) lastSync.current = Date.now();
        setPhase(result.interrupted ? 'idle' : 'ready');
      } catch {
        setPhase('idle');
      } finally {
        running.current = false;
      }
    },
    [fetcher, refreshCounts, resolveUser],
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    setOnline(navigator.onLine !== false);

    const cancelIdle = onIdle(() => void run(true));

    const onOnline = () => {
      setOnline(true);
      void run(true); // vừa có mạng lại là lúc đáng đẩy hàng đợi lên nhất
    };
    const onOffline = () => {
      setOnline(false);
      setPhase('offline');
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelIdle();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, run]);

  const syncNow = useCallback(() => void run(true), [run]);

  const queueWrite = useCallback(
    async (write: NewQueuedWrite) => {
      const id = await resolveUser();
      if (!id) return false;
      await enqueue(id, write);
      await refreshCounts(id);
      return true;
    },
    [refreshCounts, resolveUser],
  );

  /**
   * Máy này có thể được người khác dùng sau. Ghi chú, ảnh và hàng đợi đều nằm
   * trong IndexedDB dùng chung cho cả origin, nên đăng xuất phải xoá chúng.
   */
  const forget = useCallback(async () => {
    const id = userId.current ?? readStoredUser();
    if (id) {
      for (const kind of [NOTE_PREFIX, IMAGE_PREFIX, QUEUE_PREFIX, META_PREFIX]) {
        await deleteByPrefix(scopePrefix(kind, id));
      }
    }
    userId.current = null;
    setCached(0);
    setPending(0);
    setTotal(0);
    setPhase('idle');
    try {
      localStorage.removeItem(OFFLINE_USER_KEY);
    } catch {
      /* không xoá được thì cũng không chặn việc đăng xuất */
    }
  }, []);

  return { online, phase, cached, total, pending, syncNow, queueWrite, forget };
}
