// src/lib/api/rate-limit.ts

/**
 * Token bucket trong bộ nhớ tiến trình — KHÔNG cần dịch vụ trả phí.
 *
 * GIỚI HẠN ĐÃ BIẾT: trên Vercel mỗi lambda instance giữ bucket riêng, nên
 * lượng request thực tế có thể vượt hạn mức danh nghĩa khi nhiều instance
 * cùng ấm. Đây là "best effort": mục tiêu là chặn vòng lặp agent chạy loạn,
 * không phải áp hạn mức tính tiền. Muốn chặt hơn thì cần Redis (mất phí).
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SEC = 1;
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

export function takeToken(
  bucketId: string,
  opts: { capacity?: number; refillPerSec?: number } = {},
): { ok: boolean; remaining: number; resetSec: number } {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const refill = opts.refillPerSec ?? DEFAULT_REFILL_PER_SEC;
  const now = Date.now();

  let b = buckets.get(bucketId);
  if (!b) {
    b = { tokens: capacity, updatedAt: now };
    // Simple FIFO eviction; buckets are tiny and this only trims on growth.
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value as string | undefined;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(bucketId, b);
  }

  const elapsedSec = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refill);
  b.updatedAt = now;

  if (b.tokens < 1) {
    return { ok: false, remaining: 0, resetSec: Math.ceil((1 - b.tokens) / refill) || 1 };
  }

  b.tokens -= 1;
  return {
    ok: true,
    remaining: Math.floor(b.tokens),
    resetSec: Math.ceil((capacity - b.tokens) / refill),
  };
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
}
