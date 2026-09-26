import { describe, expect, it } from 'vitest';
import { installAdvice, isIos, isIosSafari } from './install-advice';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

describe('isIos / isIosSafari', () => {
  it('recognises iPhone Safari', () => {
    expect(isIos(IPHONE_SAFARI)).toBe(true);
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true);
  });

  it('treats Chrome on iOS as iOS but not Safari — it cannot install a PWA', () => {
    expect(isIos(IPHONE_CHROME)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
  });

  it('does not mistake Android Chrome for iOS', () => {
    expect(isIos(ANDROID_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
  });
});

describe('installAdvice', () => {
  it('says nothing once the app is already installed', () => {
    for (const userAgent of [IPHONE_SAFARI, IPHONE_CHROME, ANDROID_CHROME]) {
      expect(installAdvice({ userAgent, standalone: true, hasDeferredPrompt: true })).toBe('none');
    }
  });

  it('guides iPhone Safari to Add to Home Screen, since it never fires beforeinstallprompt', () => {
    expect(installAdvice({ userAgent: IPHONE_SAFARI, standalone: false, hasDeferredPrompt: false }))
      .toBe('ios-safari');
  });

  it('tells other iOS browsers to open the page in Safari', () => {
    expect(installAdvice({ userAgent: IPHONE_CHROME, standalone: false, hasDeferredPrompt: false }))
      .toBe('ios-other-browser');
  });

  it('uses the browser prompt where one exists', () => {
    expect(installAdvice({ userAgent: ANDROID_CHROME, standalone: false, hasDeferredPrompt: true }))
      .toBe('prompt');
    expect(installAdvice({ userAgent: ANDROID_CHROME, standalone: false, hasDeferredPrompt: false }))
      .toBe('none');
  });
});
