'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { Z } from '@/lib/z';

export const TOAST_DURATION_MS = 2200;

export interface ToastProps {
  message: string;
  className?: string;
}

/** Presentational toast: fixed, bottom 28, centred, 11/18 padding, r10, --text on --bg. */
export function Toast({ message, className }: ToastProps) {
  return (
    <div
      data-toast=""
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-28 left-1/2 -translate-x-1/2 rounded-10 bg-text px-18 py-11 text-14 text-bg shadow-card',
        className,
      )}
      style={{ zIndex: Z.toast }}
    >
      {message}
    </div>
  );
}

export interface ToastContextValue {
  flash: (message: string) => void;
}

const ToastActionsContext = createContext<ToastContextValue | null>(null);
const ToastMessageContext = createContext<string | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/**
 * SPEC §5 names the viewport `Toaster`. `ToastProvider` already renders it, so
 * consumers never mount it themselves — they only call `useToast().flash(…)`.
 */
export function Toaster() {
  const message = useContext(ToastMessageContext);
  if (message === null) return null;
  return <Toast message={message} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const actions = useMemo(() => ({ flash }), [flash]);

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastMessageContext.Provider value={message}>
        {children}
        <Toaster />
      </ToastMessageContext.Provider>
    </ToastActionsContext.Provider>
  );
}
