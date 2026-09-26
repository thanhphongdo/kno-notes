import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION_QUERY, useReducedMotion } from './use-reduced-motion';

const original = window.matchMedia;

/** A controllable `matchMedia` that only answers the reduced-motion query. */
function install(matches: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches,
    media: REDUCED_MOTION_QUERY,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => mq),
  });
  return {
    set(next: boolean) {
      mq.matches = next;
      act(() => listeners.forEach((fn) => fn()));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: original });
});

describe('useReducedMotion', () => {
  it('reports the current preference after mount', () => {
    install(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('defaults to full motion', () => {
    install(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('follows a change to the system setting', () => {
    const media = install(false);
    const { result } = renderHook(() => useReducedMotion());
    media.set(true);
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = install(false);
    renderHook(() => useReducedMotion()).unmount();
    expect(media.listenerCount).toBe(0);
  });
});
