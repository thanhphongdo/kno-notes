// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { takeToken, __resetRateLimits } from './rate-limit';

beforeEach(() => __resetRateLimits());
afterEach(() => vi.useRealTimers());

describe('takeToken', () => {
  it('allows the first request and reports the remaining budget', () => {
    const r = takeToken('k1', { capacity: 3, refillPerSec: 1 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('allows exactly `capacity` requests then refuses', () => {
    const opts = { capacity: 3, refillPerSec: 1 };
    expect(takeToken('k2', opts).ok).toBe(true);
    expect(takeToken('k2', opts).ok).toBe(true);
    expect(takeToken('k2', opts).ok).toBe(true);
    const fourth = takeToken('k2', opts);
    expect(fourth.ok).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.resetSec).toBeGreaterThan(0);
  });

  it('keeps separate budgets per bucket id', () => {
    const opts = { capacity: 1, refillPerSec: 1 };
    expect(takeToken('a', opts).ok).toBe(true);
    expect(takeToken('b', opts).ok).toBe(true);
    expect(takeToken('a', opts).ok).toBe(false);
  });

  it('refills over time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const opts = { capacity: 2, refillPerSec: 1 };
    takeToken('r', opts);
    takeToken('r', opts);
    expect(takeToken('r', opts).ok).toBe(false);

    vi.setSystemTime(new Date('2024-01-01T00:00:01Z'));
    expect(takeToken('r', opts).ok).toBe(true);
    expect(takeToken('r', opts).ok).toBe(false);
  });

  it('never refills above capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const opts = { capacity: 2, refillPerSec: 1 };
    takeToken('c', opts);
    vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
    expect(takeToken('c', opts).remaining).toBe(1);
  });

  it('defaults to 60 requests per minute', () => {
    for (let i = 0; i < 60; i++) expect(takeToken('d').ok).toBe(true);
    expect(takeToken('d').ok).toBe(false);
  });

  it('evicts old buckets so memory does not grow without bound', () => {
    for (let i = 0; i < 12_000; i++) takeToken('bucket-' + i, { capacity: 1, refillPerSec: 1 });
    // The oldest bucket was evicted, so its budget is fresh again.
    expect(takeToken('bucket-0', { capacity: 1, refillPerSec: 1 }).ok).toBe(true);
  });
});
