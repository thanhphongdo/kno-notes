'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Z } from '@/lib/z';

/** Not in the DOM lib yet — Chromium-only, and the reason this component exists. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const INSTALL_DISMISS_KEY = 'kn-install-dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Offers the browser's own install flow, once, and only if the browser offers
 * it first. "Để sau" is remembered so the bar never becomes nagware — and a
 * blocked `localStorage` degrades to "ask again", never to a crash.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (dismissedBefore()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* nothing to remember it with — the bar simply reappears next session */
    }
    setDeferred(null);
  };

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* the browser withdrew the offer */
    }
    setDeferred(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Cài đặt ứng dụng"
      className="fixed inset-x-16 bottom-16 mx-auto flex max-w-420 items-center gap-12 rounded-12 border border-line bg-surface px-16 py-14 shadow-card"
      style={{ zIndex: Z.settingsBackdrop }}
    >
      <span className="flex-1 text-13 leading-[1.5]">
        Cài Kno-Notes lên máy để mở nhanh và dùng ngoại tuyến.
      </span>
      <Button variant="ghost" size="32" onClick={dismiss}>
        Để sau
      </Button>
      <Button variant="primary" size="32" onClick={install}>
        Cài đặt
      </Button>
    </div>
  );
}
