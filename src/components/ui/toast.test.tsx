import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastProvider, useToast } from './toast';

function Trigger() {
  const { flash } = useToast();
  return <button type="button" onClick={() => flash('Đã lưu · phiên bản v2')}>go</button>;
}

function clickTrigger() {
  fireEvent.click(screen.getByRole('button', { name: 'go' }));
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message and hides it after 2200ms', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    clickTrigger();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu · phiên bản v2');

    act(() => { vi.advanceTimersByTime(TOAST_DURATION_MS - 1); });
    expect(screen.queryByRole('status')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the prototype geometry and emits the data-toast hook', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    clickTrigger();
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('data-toast');
    expect(el.className).toContain('bottom-28');
    expect(el.className).toContain('rounded-10');
    expect(el.className).toContain('bg-text');
    expect(el.className).toContain('text-bg');
    expect(el.className).toContain('py-11');
    expect(el.className).toContain('px-18');
  });

  it('restarts the timer when a second message arrives', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    clickTrigger();
    act(() => { vi.advanceTimersByTime(2000); });
    clickTrigger();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('status')).not.toBeNull();
  });

  it('throws when useToast is called outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
