import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_POLL_MS, useAppUpdate } from './use-app-update';

/** Bản giả tối thiểu của một `ServiceWorker` đang cài. */
function fakeWorker() {
  const listeners = new Set<() => void>();
  return {
    state: 'installing' as string,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    postMessage: vi.fn(),
    finishInstall() {
      this.state = 'installed';
      listeners.forEach((fn) => fn());
    },
  };
}

function fakeRegistration(installing: ReturnType<typeof fakeWorker> | null = null) {
  const found = new Set<() => void>();
  return {
    installing,
    waiting: null as { postMessage: (m: string) => void } | null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: (event: string, fn: () => void) => {
      if (event === 'updatefound') found.add(fn);
    },
    fireUpdateFound(worker: ReturnType<typeof fakeWorker>) {
      this.installing = worker;
      found.forEach((fn) => fn());
    },
  };
}

function install(registration: ReturnType<typeof fakeRegistration>, controller: unknown) {
  const container = {
    controller,
    register: vi.fn().mockResolvedValue(registration),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
  return container;
}

const render = (reload = vi.fn()) =>
  renderHook(() => useAppUpdate({ enabled: true, buildId: 'abc123', reload }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('useAppUpdate', () => {
  it('registers the worker under the current build id', async () => {
    const container = install(fakeRegistration(), {});
    render();
    await waitFor(() => expect(container.register).toHaveBeenCalled());
    expect(container.register).toHaveBeenCalledWith('/sw.js?v=abc123', { scope: '/' });
  });

  it('does nothing at all when disabled', () => {
    const container = install(fakeRegistration(), {});
    renderHook(() => useAppUpdate({ enabled: false, buildId: 'abc123' }));
    expect(container.register).not.toHaveBeenCalled();
  });

  /**
   * Phân biệt QUAN TRỌNG: lần cài đầu tiên cũng đi qua trạng thái `installed`.
   * Nếu tính cả nó thì mọi người dùng mới đều bị mời "tải lại" ngay lần mở
   * đầu, trong khi chẳng có bản nào cũ hơn để thay.
   */
  it('stays quiet for a first install, where no worker was in charge yet', async () => {
    const worker = fakeWorker();
    const registration = fakeRegistration(worker);
    install(registration, null);

    const { result } = render();
    await waitFor(() => expect(registration.update).toBeDefined());
    act(() => worker.finishInstall());

    expect(result.current.ready).toBe(false);
  });

  it('announces a build that finished installing while an older one was running', async () => {
    const worker = fakeWorker();
    const registration = fakeRegistration(null);
    install(registration, { scriptURL: '/sw.js?v=old' });

    const { result } = render();
    await waitFor(() => expect(result.current.ready).toBe(false));

    act(() => registration.fireUpdateFound(worker));
    act(() => worker.finishInstall());

    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('picks up a build that was already waiting from a previous visit', async () => {
    const registration = fakeRegistration(null);
    registration.waiting = { postMessage: vi.fn() };
    install(registration, { scriptURL: '/sw.js?v=old' });

    const { result } = render();
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('asks the browser to re-check whenever the tab is looked at again', async () => {
    const registration = fakeRegistration();
    install(registration, {});
    render();
    await waitFor(() => expect(registration.update).not.toHaveBeenCalled());

    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
  });

  it('keeps checking hourly for a tab that is never closed', async () => {
    const registration = fakeRegistration();
    install(registration, {});
    render();
    await waitFor(() => expect(registration.update).not.toHaveBeenCalled());

    await act(async () => {
      vi.advanceTimersByTime(UPDATE_POLL_MS);
    });
    await waitFor(() => expect(registration.update).toHaveBeenCalled());
  });

  it('reloads only when asked, and nudges a waiting worker aside first', async () => {
    const waiting = { postMessage: vi.fn() };
    const registration = fakeRegistration(null);
    registration.waiting = waiting;
    install(registration, { scriptURL: '/sw.js?v=old' });

    const reload = vi.fn();
    const { result } = render(reload);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(reload).not.toHaveBeenCalled();

    act(() => result.current.apply());
    expect(waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('survives a browser with no service worker support', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const { result } = renderHook(() => useAppUpdate({ enabled: true, buildId: 'abc' }));
    expect(result.current.ready).toBe(false);
  });

  it('survives a registration that is refused', async () => {
    const container = {
      controller: {},
      register: vi.fn().mockRejectedValue(new Error('blocked')),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });

    const { result } = render();
    await waitFor(() => expect(container.register).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
  });
});
