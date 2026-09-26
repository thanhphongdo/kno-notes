import { act, renderHook } from '@testing-library/react';
import { afterAll, describe, expect, it } from 'vitest';
import { MOBILE_BREAKPOINT, useIsMobile } from './use-is-mobile';

const ORIGINAL_WIDTH = window.innerWidth;

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

afterAll(() => setWidth(ORIGINAL_WIDTH));

describe('useIsMobile', () => {
  it('uses 820 as the single breakpoint', () => {
    expect(MOBILE_BREAKPOINT).toBe(820);
  });

  it('is true strictly below 820', () => {
    setWidth(819);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('is false at exactly 820', () => {
    setWidth(820);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('waits for the effect by default, so hydration can never mismatch', () => {
    setWidth(390);
    let firstRender: boolean | null = null;
    renderHook(() => {
      const value = useIsMobile();
      firstRender ??= value;
      return value;
    });
    expect(firstRender).toBe(false);
  });

  it('answers from the first render when asked to, for overlays opened by a click', () => {
    setWidth(390);
    let firstRender: boolean | null = null;
    renderHook(() => {
      const value = useIsMobile({ immediate: true });
      firstRender ??= value;
      return value;
    });
    expect(firstRender).toBe(true);
  });

  it('reacts to resize', () => {
    setWidth(1440);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => setWidth(390));
    expect(result.current).toBe(true);
  });
});
