// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Lru } from './lru';

describe('Lru', () => {
  it('stores and returns values', () => {
    const c = new Lru<number>(3);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('counts a get as a use, protecting the entry from eviction', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });

  it('overwrites without growing', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('a', 9);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(9);
  });

  it('deletes and clears', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.delete('a');
    expect(c.get('a')).toBeUndefined();
    c.set('b', 2);
    c.clear();
    expect(c.size).toBe(0);
  });

  it('is a no-op cache when max is 0', () => {
    const c = new Lru<number>(0);
    c.set('a', 1);
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });
});
