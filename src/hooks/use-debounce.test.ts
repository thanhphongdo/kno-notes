import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedCallback } from './use-debounce';

describe('useDebouncedCallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once, with the last arguments, after the window elapses', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(spy, 500));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(499); });
    expect(spy).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('calls the latest callback, not the one captured at mount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useDebouncedCallback(fn, 100),
      { initialProps: { fn: first as () => void } },
    );

    act(() => { result.current(); });
    rerender({ fn: second });
    act(() => { vi.advanceTimersByTime(100); });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps a stable identity while the delay is unchanged', () => {
    const noop: () => void = () => {};
    const { result, rerender } = renderHook(({ fn }: { fn: () => void }) => useDebouncedCallback(fn, 100), {
      initialProps: { fn: noop },
    });
    const first = result.current;
    rerender({ fn: () => {} });
    expect(result.current).toBe(first);
  });

  it('cancels a pending call when the component unmounts', () => {
    const spy = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 100));
    act(() => { result.current(); });
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(spy).not.toHaveBeenCalled();
  });
});
