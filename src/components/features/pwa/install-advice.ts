/**
 * What, if anything, to tell this browser about installing the app.
 *
 * iOS is the awkward case. Safari can add a PWA to the Home Screen but never
 * fires `beforeinstallprompt`, so the Chromium flow leaves iPhone users with no
 * affordance at all. Other iOS browsers render with WebKit and cannot install a
 * standalone PWA, so the honest advice there is to open the page in Safari.
 */
export type InstallAdvice = 'none' | 'prompt' | 'ios-safari' | 'ios-other-browser';

export interface InstallAdviceInput {
  userAgent: string;
  /** Already launched from the Home Screen. */
  standalone: boolean;
  /** A `beforeinstallprompt` event is in hand. */
  hasDeferredPrompt: boolean;
}

export function isIos(userAgent: string): boolean {
  // iPadOS 13+ reports a desktop Safari UA; the touch check disambiguates it,
  // and callers on the server simply get `false`.
  if (/iPhone|iPod/i.test(userAgent)) return true;
  if (/iPad/i.test(userAgent)) return true;
  const isMacLike = /Macintosh/i.test(userAgent);
  const hasTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  return isMacLike && hasTouch;
}

/** True only for real Safari — CriOS/FxiOS/EdgiOS are WebKit shells. */
export function isIosSafari(userAgent: string): boolean {
  if (!isIos(userAgent)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(userAgent);
}

export function installAdvice({
  userAgent,
  standalone,
  hasDeferredPrompt,
}: InstallAdviceInput): InstallAdvice {
  if (standalone) return 'none';
  if (isIos(userAgent)) return isIosSafari(userAgent) ? 'ios-safari' : 'ios-other-browser';
  return hasDeferredPrompt ? 'prompt' : 'none';
}

/** True when the page is running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (iosStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}
