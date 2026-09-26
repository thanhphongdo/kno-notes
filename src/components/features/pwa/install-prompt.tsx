'use client';

import { useEffect, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { Z } from '@/lib/z';
import { type InstallAdvice, installAdvice, isStandalone } from './install-advice';

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
 * Offers a way to install the app, once.
 *
 * Chromium hands us `beforeinstallprompt` and we just relay it. iOS never does:
 * Safari can add a PWA to the Home Screen but only through its own Share menu,
 * and other iOS browsers render with WebKit and cannot install one at all. So
 * iPhone users get instructions rather than a button that cannot work.
 *
 * "Để sau" is remembered so the bar never becomes nagware, and a blocked
 * `localStorage` degrades to "ask again", never to a crash.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [advice, setAdvice] = useState<InstallAdvice>('none');

  useEffect(() => {
    if (dismissedBefore()) return;

    const evaluate = (hasDeferredPrompt: boolean) =>
      setAdvice(
        installAdvice({
          userAgent: navigator.userAgent,
          standalone: isStandalone(),
          hasDeferredPrompt,
        }),
      );

    evaluate(false);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      evaluate(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Installing removes the reason to keep offering.
    const onInstalled = () => setAdvice('none');
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (advice === 'none') return null;

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      /* nothing to remember it with — the bar simply reappears next session */
    }
    setDeferred(null);
    setAdvice('none');
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* the browser withdrew the offer */
    }
    setDeferred(null);
    setAdvice('none');
  };

  const message =
    advice === 'ios-safari'
      ? 'Cài Kno-Notes lên máy: chạm nút Chia sẻ rồi chọn “Thêm vào Màn hình chính”.'
      : advice === 'ios-other-browser'
        ? 'Để cài Kno-Notes lên iPhone, mở trang này bằng Safari rồi chọn “Thêm vào Màn hình chính”.'
        : 'Cài Kno-Notes lên máy để mở nhanh và dùng ngoại tuyến.';

  return (
    <div
      role="dialog"
      aria-label="Cài đặt ứng dụng"
      data-install-prompt={advice}
      className="fixed inset-x-16 bottom-16 mx-auto flex max-w-420 items-center gap-12 rounded-12 border border-line bg-surface px-16 py-14 shadow-card"
      style={{ zIndex: Z.settingsBackdrop }}
    >
      {advice === 'ios-safari' ? (
        <span className="shrink-0 text-accent" aria-hidden="true">
          <Icon name="download" size={17} />
        </span>
      ) : null}
      <span className="flex-1 text-13 leading-[1.5]">{message}</span>
      <Button variant="ghost" size="32" onClick={dismiss}>
        {advice === 'prompt' ? 'Để sau' : 'Đã hiểu'}
      </Button>
      {advice === 'prompt' ? (
        <Button variant="primary" size="32" icon="download" onClick={install}>
          Cài đặt
        </Button>
      ) : null}
    </div>
  );
}
