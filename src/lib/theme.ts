export const PREFS_KEY = 'kno-notes-prefs';

export type Theme = 'light' | 'dark';
export type Accent = 'teal' | 'indigo' | 'plum';

export const FS_MIN = 14;
export const FS_MAX = 22;
export const FS_DEFAULT = 17;

export const THEMES: readonly Theme[] = ['light', 'dark'];
export const ACCENTS: readonly Accent[] = ['teal', 'indigo', 'plum'];

/**
 * Clamp any untrusted value to an integer font size in [14, 22].
 * `null`, `undefined`, booleans, empty strings and anything unparseable fall
 * back to the default rather than coercing to 0 (which would clamp to 14).
 */
export function clampFontSize(value: unknown): number {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  else return FS_DEFAULT;
  if (!Number.isFinite(n)) return FS_DEFAULT;
  return Math.min(FS_MAX, Math.max(FS_MIN, Math.round(n)));
}

export interface Prefs {
  theme?: Theme;
  accent?: Accent;
  fontSize?: number;
}

/** Apply prefs to <html>. Safe to call on every change; idempotent. */
export function applyPrefs(prefs: Prefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === 'dark' ? 'dark' : 'light';
  root.dataset.accent = prefs.accent && prefs.accent !== 'teal' ? prefs.accent : 'teal';
  root.style.setProperty('--fs', `${clampFontSize(prefs.fontSize)}px`);
}
